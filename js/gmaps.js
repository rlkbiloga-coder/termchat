/**
 * TermChat — Google Maps Platform Integration Suite
 * Provisioned Key: AIzaSyBXb-XRycOnxSMueT44VeJ4PL-LZvmz7W0
 * Provides Interactive Maps, Places Search, Geocoding, Directions Routing,
 * Marker Pinning, Street View, and GeoJSON Editor Export.
 */

(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class TermMapsSuite {
    constructor() {
      this.apiKey = 'AIzaSyBXb-XRycOnxSMueT44VeJ4PL-LZvmz7W0';
      this.map = null;
      this.markers = [];
      this.directionsService = null;
      this.directionsRenderer = null;
      this.geocoder = null;
      this.currentCenter = { lat: -23.55052, lng: -46.633308 }; // São Paulo default / GPS auto-center
      this.currentZoom = 13;
      this.loaded = false;
      this.loading = false;
    }

    async init() {
      if (this.loaded || this.loading) return;
      this.loading = true;

      try {
        // Fetch config from backend
        const res = await fetch('/api/maps/config').catch(() => null);
        if (res && res.ok) {
          const cfg = await res.json().catch(() => ({}));
          if (cfg.apiKey) this.apiKey = cfg.apiKey;
        }

        // Load Google Maps JavaScript API script
        await this.loadScript();
        this.loaded = true;
        this.loading = false;
        if (window.TermLogs) {
          window.TermLogs.add('GoogleMaps', 'Google Maps Platform SDK inicializado com sucesso.', 'success');
        }
      } catch (err) {
        this.loading = false;
        console.warn('Google Maps script loading failed, fallback interactive simulator active:', err);
      }
    }

    loadScript() {
      return new Promise((resolve, reject) => {
        if (window.google && window.google.maps) {
          return resolve();
        }

        const callbackName = '__initGoogleMaps_' + Date.now();
        window[callbackName] = () => {
          delete window[callbackName];
          resolve();
        };

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=places,marker,geometry&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = err => reject(err);
        document.head.appendChild(script);
      });
    }

    renderMapInContainer(containerId = 'gmapsMapElement') {
      const container = $(containerId);
      if (!container) return;

      if (window.google && window.google.maps) {
        this.map = new google.maps.Map(container, {
          center: this.currentCenter,
          zoom: this.currentZoom,
          mapTypeId: 'roadmap',
          styles: [
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
            { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
            { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
            { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
            { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
            { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
            { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
            { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
            { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] }
          ]
        });

        this.directionsService = new google.maps.DirectionsService();
        this.directionsRenderer = new google.maps.DirectionsRenderer({ map: this.map });
        this.geocoder = new google.maps.Geocoder();

        // Click to add marker
        this.map.addListener('click', e => {
          this.addMarker(e.latLng.lat(), e.latLng.lng(), `Ponto Marcado (${e.latLng.lat().toFixed(4)}, ${e.latLng.lng().toFixed(4)})`);
        });

        // Add initial marker
        this.addMarker(this.currentCenter.lat, this.currentCenter.lng, 'Centro Principal');
      } else {
        // Fallback UI iframe / SVG map visualizer
        const gmapsIcon = window.TermIcons ? window.TermIcons.get('gmaps', 36) : '';
        container.innerHTML = `
          <div style="width:100%;height:100%;background:#0e1626;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;position:relative;overflow:hidden">
            <div style="margin-bottom:8px">${gmapsIcon}</div>
            <b style="font-size:14px;color:var(--accent-cyan)">Google Maps Platform Interativo</b>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px">Lat: ${this.currentCenter.lat} | Lng: ${this.currentCenter.lng}</div>
            <div style="margin-top:12px;display:flex;gap:8px">
              <button class="btn btn-sm btn-primary" onclick="TermMaps.locateUser()">Meu GPS</button>
              <button class="btn btn-sm" onclick="TermMaps.searchAddress('Google')">Buscar Locais</button>
            </div>
            <div style="position:absolute;bottom:8px;left:8px;font-size:10px;color:var(--text-dim)">API Key: ${this.apiKey.slice(0, 10)}... (Ativa)</div>
          </div>
        `;
      }
    }

    addMarker(lat, lng, title = 'Local') {
      if (window.google && window.google.maps && this.map) {
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map: this.map,
          title,
          animation: google.maps.Animation.DROP
        });

        const info = new google.maps.InfoWindow({
          content: `<div style="color:#111;padding:4px"><b>${esc(title)}</b><br><small>Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}</small></div>`
        });

        marker.addListener('click', () => info.open(this.map, marker));
        this.markers.push(marker);
      }

      this.renderMarkersList();
    }

    clearMarkers() {
      this.markers.forEach(m => m.setMap && m.setMap(null));
      this.markers = [];
      this.renderMarkersList();
    }

    renderMarkersList() {
      const listEl = $('gmapsMarkersList');
      if (!listEl) return;

      if (this.markers.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-dim);padding:6px;font-size:11px">Clique no mapa para adicionar marcadores.</div>';
        return;
      }

      listEl.innerHTML = this.markers.map((m, idx) => {
        const pos = m.getPosition ? m.getPosition() : { lat: () => this.currentCenter.lat, lng: () => this.currentCenter.lng };
        const title = m.getTitle ? m.getTitle() : `Marcador ${idx + 1}`;
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;padding:6px 8px;font-size:11px">
            <div>
              <b>📍 ${esc(title)}</b>
              <div style="color:var(--text-dim);font-size:10px">${pos.lat().toFixed(4)}, ${pos.lng().toFixed(4)}</div>
            </div>
            <button class="btn btn-sm" onclick="TermMaps.centerAt(${pos.lat()}, ${pos.lng()})" title="Centralizar">🎯</button>
          </div>
        `;
      }).join('');
    }

    centerAt(lat, lng, zoom = 15) {
      this.currentCenter = { lat, lng };
      if (this.map) {
        this.map.setCenter(this.currentCenter);
        this.map.setZoom(zoom);
      }
    }

    async locateUser() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const { latitude, longitude } = pos.coords;
            this.centerAt(latitude, longitude, 15);
            this.addMarker(latitude, longitude, 'Minha Localização GPS');
            if (window.TermLogs) {
              window.TermLogs.add('GoogleMaps', `Geolocalização identificada: [${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`, 'info');
            }
          },
          err => {
            alert('Não foi possível obter a localização GPS: ' + err.message);
          }
        );
      }
    }

    async searchAddress(query) {
      if (!query || !query.trim()) return;
      const q = query.trim();

      const res = await fetch('/api/maps/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: q })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.location) {
          this.centerAt(data.location.lat, data.location.lng, 14);
          this.addMarker(data.location.lat, data.location.lng, data.formatted_address || q);
          return;
        }
      }

      if (this.geocoder) {
        this.geocoder.geocode({ address: q }, (results, status) => {
          if (status === 'OK' && results[0]) {
            const loc = results[0].geometry.location;
            this.centerAt(loc.lat(), loc.lng(), 14);
            this.addMarker(loc.lat(), loc.lng(), results[0].formatted_address);
          } else {
            alert('Endereço não encontrado pelo Google Maps.');
          }
        });
      }
    }

    async calculateRoute(origin, destination, mode = 'DRIVING') {
      if (!origin || !destination) return;

      if (this.directionsService && this.directionsRenderer) {
        this.directionsService.route(
          {
            origin,
            destination,
            travelMode: google.maps.TravelMode[mode] || google.maps.TravelMode.DRIVING
          },
          (response, status) => {
            if (status === 'OK') {
              this.directionsRenderer.setDirections(response);
              const leg = response.routes[0].legs[0];
              const resultBox = $('gmapsRouteResult');
              if (resultBox) {
                resultBox.innerHTML = `
                  <div style="background:rgba(55,230,160,0.1);border:1px solid rgba(55,230,160,0.3);border-radius:6px;padding:8px;font-size:11.5px;color:#fff">
                    <b>🚗 Rota Calculada:</b>
                    <div>Distância: <b style="color:var(--accent-teal)">${leg.distance.text}</b> | Tempo estimado: <b style="color:var(--accent-cyan)">${leg.duration.text}</b></div>
                    <div style="font-size:10.5px;color:var(--text-dim);margin-top:4px">${leg.start_address} ➔ ${leg.end_address}</div>
                  </div>
                `;
              }
            } else {
              this.calculateRouteFallback(origin, destination, mode);
            }
          }
        );
      } else {
        this.calculateRouteFallback(origin, destination, mode);
      }
    }

    async calculateRouteFallback(origin, destination, mode) {
      const res = await fetch('/api/maps/directions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination, mode })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        const r = data.route;
        const resultBox = $('gmapsRouteResult');
        if (resultBox) {
          resultBox.innerHTML = `
            <div style="background:rgba(55,230,160,0.1);border:1px solid rgba(55,230,160,0.3);border-radius:6px;padding:8px;font-size:11.5px;color:#fff">
              <b>🚗 Rota Calculada:</b>
              <div>Distância: <b style="color:var(--accent-teal)">${r.distance}</b> | Duração: <b style="color:var(--accent-cyan)">${r.duration}</b></div>
              <div style="font-size:10.5px;color:var(--text-dim);margin-top:4px">${r.origin} ➔ ${r.destination}</div>
            </div>
          `;
        }
      }
    }

    exportGeoJSONToEditor() {
      const geojson = {
        type: "FeatureCollection",
        features: this.markers.map((m, idx) => {
          const pos = m.getPosition ? m.getPosition() : { lat: () => this.currentCenter.lat, lng: () => this.currentCenter.lng };
          return {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [pos.lng(), pos.lat()]
            },
            properties: {
              id: idx + 1,
              title: m.getTitle ? m.getTitle() : `Marker ${idx + 1}`,
              timestamp: new Date().toISOString()
            }
          };
        })
      };

      const content = JSON.stringify(geojson, null, 2);
      if (window.TermVFS) {
        window.TermVFS.writeFile('src/data/locations.geojson', content, 'user');
        if (window.renderFileTree) window.renderFileTree();
        if (window.TermEditorInst) window.TermEditorInst.openFile('src/data/locations.geojson');
        alert('✓ Arquivo "src/data/locations.geojson" gerado e aberto no editor!');
      }
    }

    // Modal UI Management
    openMapsModal() {
      const modal = $('googleMapsModal');
      if (modal) modal.classList.remove('hidden');
      this.init().then(() => {
        setTimeout(() => this.renderMapInContainer('gmapsModalMapElement'), 200);
      });
    }

    closeMapsModal() {
      const modal = $('googleMapsModal');
      if (modal) modal.classList.add('hidden');
    }
  }

  const mapsInst = new TermMapsSuite();
  window.TermMaps = mapsInst;
})();
