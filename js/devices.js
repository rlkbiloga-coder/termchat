/**
 * TermChat — Device & Hardware APIs Manager
 * Handles Camera, Microphone, Geolocation, Clipboard, Web Bluetooth, Web Serial/USB
 * with modern permission gates and clean UI feedback.
 */

(function () {
  "use strict";

  const $ = id => document.getElementById(id);

  class TermDeviceManager {
    constructor() {
      this.mediaStream = null;
      this.isRecording = false;
      this.mediaRecorder = null;
      this.audioChunks = [];
    }

    // --- Camera Stream & Photo Capture ---
    async openCameraModal() {
      const modal = $('cameraModal');
      const video = $('cameraVideo');
      if (modal) modal.classList.remove('hidden');

      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (video) {
          video.srcObject = this.mediaStream;
          video.play();
        }
        if (window.TermLogs) {
          window.TermLogs.add('Hardware', 'Câmera ativada com sucesso.', 'info');
        }
      } catch (err) {
        alert(`Não foi possível acessar a câmera: ${err.message}`);
        this.closeCameraModal();
      }
    }

    closeCameraModal() {
      const modal = $('cameraModal');
      const video = $('cameraVideo');
      if (modal) modal.classList.add('hidden');

      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(t => t.stop());
        this.mediaStream = null;
      }
      if (video) video.srcObject = null;
    }

    captureSnapshot() {
      const video = $('cameraVideo');
      if (!video) return;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/png');
      const fileName = `snapshot-${Date.now()}.png`;

      // Save to Workspace VFS as binary representation
      if (window.TermVFS) {
        window.TermVFS.writeFile(fileName, dataUrl, 'camera');
        if (window.renderFileTree) window.renderFileTree();
      }

      // Also trigger upload to Storage simulation
      fetch('/api/storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, fileType: 'image/png', content: dataUrl.slice(0, 100), size: dataUrl.length })
      });

      alert(`✓ Foto capturada e salva no workspace como "${fileName}"!`);
      this.closeCameraModal();
    }

    // --- Permission Checker & Friendly UI Feedback Utility ---
    async checkPermission(type) { // 'clipboard-read', 'geolocation', 'notifications'
      try {
        if (!navigator.permissions || !navigator.permissions.query) {
          return { state: 'prompt', supported: false };
        }
        let permissionName = type;
        if (type === 'clipboard-read') permissionName = 'clipboard-read';
        else if (type === 'geolocation') permissionName = 'geolocation';

        const result = await navigator.permissions.query({ name: permissionName });
        if (result.state === 'denied') {
          if (window.TermLogs) {
            window.TermLogs.add('Device', `Permissão de '${type}' negada. Habilite-a manualmente nas configurações do navegador.`, 'warning');
          }
          this.showFriendlyPermissionBanner(type);
        }
        return { state: result.state, supported: true };
      } catch (e) {
        return { state: 'prompt', supported: false };
      }
    }

    showFriendlyPermissionBanner(type) {
      const bannerId = 'permBanner_' + type;
      if (document.getElementById(bannerId)) return;

      const banner = document.createElement('div');
      banner.id = bannerId;
      banner.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;background:var(--bg-card);border:1px solid var(--accent-pink);color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.5);font-size:12px;display:flex;align-items:center;gap:12px;max-width:340px;animation:fadeIn 0.3s ease';
      banner.innerHTML = `
        <span style="font-size:20px">⚠️</span>
        <div style="flex:1">
          <b>Permissão necessária (${type})</b>
          <div style="color:var(--text-muted);font-size:11px;margin-top:2px">O recurso precisa que você permita o acesso nas configurações do navegador (ícone de cadeado na barra de endereços).</div>
        </div>
        <button onclick="document.getElementById('${bannerId}').remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px">&times;</button>
      `;
      document.body.appendChild(banner);
      setTimeout(() => {
        if (document.getElementById(bannerId)) document.getElementById(bannerId).remove();
      }, 8000);
    }

    // --- Geolocation ---
    async getDeviceLocation() {
      await this.checkPermission('geolocation');
      if (!navigator.geolocation) {
        if (window.TermLogs) window.TermLogs.add('Device', 'Geolocalização não suportada neste ambiente.', 'warning');
        return null;
      }

      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const { latitude, longitude, accuracy } = pos.coords;
            const res = `Lat: ${latitude.toFixed(4)}, Long: ${longitude.toFixed(4)} (Precisão: ~${Math.round(accuracy)}m)`;
            if (window.TermLogs) window.TermLogs.add('Device', `Localização obtida: ${res}`, 'success');
            resolve(pos.coords);
          },
          err => {
            // Graceful fallback for sandbox policy restrictions
            if (window.TermLogs) window.TermLogs.add('Device', `Geolocalização indisponível por política de permissão do sandbox (${err.message}).`, 'info');
            this.showFriendlyPermissionBanner('geolocation');
            resolve(null);
          },
          { timeout: 8000 }
        );
      });
    }

    // --- Clipboard ---
    async copyToClipboard(text) {
      await this.checkPermission('clipboard-write');
      try {
        await navigator.clipboard.writeText(text);
        if (window.TermLogs) window.TermLogs.add('Device', 'Texto copiado para a área de transferência.', 'success');
      } catch (err) {
        if (window.TermLogs) window.TermLogs.add('Device', `Cópia restrita por política: ${err.message}`, 'warning');
        this.showFriendlyPermissionBanner('clipboard-write');
      }
    }

    async readFromClipboard() {
      await this.checkPermission('clipboard-read');
      try {
        const text = await navigator.clipboard.readText();
        if (window.TermLogs) window.TermLogs.add('Device', `Leitura de clipboard bem-sucedida (${text.length} chars)`, 'success');
        return text;
      } catch (err) {
        // Graceful fallback for sandbox policy restrictions where readText is disabled
        if (window.TermLogs) window.TermLogs.add('Device', `Leitura de clipboard bloqueada por policy do sandbox. Use Ctrl+V no editor.`, 'info');
        this.showFriendlyPermissionBanner('clipboard-read');
        return '';
      }
    }

    // --- Web Bluetooth Scanner ---
    async scanBluetoothDevices() {
      if (!navigator.bluetooth) {
        alert('Web Bluetooth API não é suportada neste navegador ou ambiente.');
        return;
      }

      try {
        if (window.TermLogs) {
          window.TermLogs.add('Bluetooth', 'Escaneando dispositivos BLE próximos...', 'info');
        }
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true
        });
        alert(`✓ Dispositivo Bluetooth encontrado: ${device.name || device.id}`);
      } catch (err) {
        alert(`Bluetooth: ${err.message}`);
      }
    }

    // --- Web Serial / USB ---
    async connectSerialDevice() {
      if (!('serial' in navigator)) {
        alert('Web Serial API não é suportada neste navegador (disponível no Chrome/Edge).');
        return;
      }

      try {
        if (window.TermLogs) {
          window.TermLogs.add('Serial', 'Solicitando porta serial / USB...', 'info');
        }
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        alert('✓ Porta Serial conectada com sucesso a 9600 baud!');
      } catch (err) {
        alert(`Serial/USB: ${err.message}`);
      }
    }
  }

  window.TermDevices = new TermDeviceManager();

  // Global checkPermissions utility function
  window.checkPermissions = async function() {
    const manager = window.TermDevices;
    if (!manager) return { clipboardRead: 'unknown', geolocation: 'unknown' };

    const cbRes = await manager.checkPermission('clipboard-read');
    const geoRes = await manager.checkPermission('geolocation');

    if (cbRes.state === 'denied' || geoRes.state === 'denied') {
      if (window.TermLogs) {
        window.TermLogs.add('Permissions', 'Atenção: Permissões de clipboard-read e/ou geolocation estão negadas. Habilite-as nas configurações do navegador (ícone de cadeado na barra de endereços).', 'warning');
      }
      manager.showFriendlyPermissionBanner('clipboard-read/geolocation');
    }

    return {
      clipboardRead: cbRes.state,
      geolocation: geoRes.state
    };
  };
})();
