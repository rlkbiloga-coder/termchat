"use strict";

/**
 * TermChat Voice Assistant (STT & TTS)
 */
class TermVoiceAssistant {
  constructor() {
    this.isListening = false;
    this.recognition = null;
    this.ttsEnabled = localStorage.getItem('tc_voice_tts') === 'true';
    this.lang = 'pt-BR';
    this.init();
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.lang;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.updateUi(true);
      };

      this.recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        this.onCommand(text);
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        this.isListening = false;
        this.updateUi(false);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.updateUi(false);
      };
    }
  }

  toggleListen() {
    if (!this.recognition) {
      alert('Reconhecimento de voz não é suportado pelo seu navegador atual.');
      return;
    }

    if (this.isListening) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (e) {
        console.warn(e);
      }
    }
  }

  updateUi(listening) {
    const btn = document.getElementById('voiceMicBtn');
    if (btn) {
      btn.classList.toggle('listening', listening);
      btn.title = listening ? 'Gravando... fale agora' : 'Comando por voz (Microfone)';
    }
  }

  onCommand(raw) {
    const text = raw.trim();
    if (window.TermLogs) {
      window.TermLogs.add('Voz', `Comando reconhecido: "${text}"`, 'info');
    }

    const lower = text.toLowerCase();

    if (lower.includes('abrir') || lower.includes('editar')) {
      const match = lower.match(/(?:abrir|editar)\s+([a-zA-Z0-9._-]+)/);
      if (match && match[1] && window.TermEditorInst) {
        window.TermEditorInst.openFile(match[1]);
        if (window.switchView) window.switchView('ide');
        this.speak(`Abrindo arquivo ${match[1]}`);
        return;
      }
    }

    if (lower.includes('teste') || lower.includes('testar')) {
      if (window.TermSandboxInst) {
        window.TermSandboxInst.execute('npm test');
        if (window.switchView) window.switchView('ide');
        this.speak('Executando testes do projeto');
        return;
      }
    }

    if (lower.includes('preview') || lower.includes('visualizar')) {
      if (window.switchView) {
        window.switchView('preview');
        this.speak('Abrindo preview ao vivo');
        return;
      }
    }

    if (lower.includes('limpar')) {
      if (window.TermSandboxInst) {
        window.TermSandboxInst.execute('clear');
        this.speak('Terminal limpo');
        return;
      }
    }

    // Default: put into chat input and send
    const txt = document.getElementById('txt');
    if (txt) {
      txt.value = text;
      if (window.switchView) window.switchView('chat');
      const form = document.getElementById('in');
      if (form) form.dispatchEvent(new Event('submit'));
      this.speak('Mensagem enviada');
    }
  }

  speak(text) {
    if (!this.ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/<[^>]+>/g, '').replace(/```[\s\S]*?```/g, 'Bloco de código gerado.').slice(0, 250);
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = this.lang;
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  }

  toggleTts() {
    this.ttsEnabled = !this.ttsEnabled;
    localStorage.setItem('tc_voice_tts', String(this.ttsEnabled));
    return this.ttsEnabled;
  }
}

window.TermVoice = new TermVoiceAssistant();
