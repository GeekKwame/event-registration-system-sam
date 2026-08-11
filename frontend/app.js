/**
 * Event-Connect — Frontend Application
 * Universal Multi-API Event Manager & Ticketing Hub
 *
 * Connects to AWS SAM API Gateway & Lambda handlers.
 * All business logic (fetch, register, cancel, CORS fallback) is preserved.
 */

// ============================================================
// Constants & Storage Keys
// ============================================================
const STORAGE_KEY_API_URL = 'eventpulse_api_url';
const STORAGE_KEY_LAST_EMAIL = 'eventpulse_last_registration_email';
const STORAGE_KEY_LOCAL_REGS = 'eventpulse_local_registrations_store';

const HUB_API_URL = 'https://kems8drwn6.execute-api.us-west-1.amazonaws.com/Prod';
const DEFAULT_API_URL = HUB_API_URL;

// ============================================================
// Utility Functions
// ============================================================

function normalizeApiUrl(value) {
  return String(value || '').trim().replace(/[,\s]+$/, '').replace(/\/+$/, '');
}

function unwrapApiPayload(payload) {
  if (payload && typeof payload.body === 'string') {
    try { return JSON.parse(payload.body); } catch { return payload; }
  }
  return payload;
}

function getLocalRegistrations() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_LOCAL_REGS) || '[]'); }
  catch { return []; }
}

function currentApiKey() {
  return normalizeApiUrl(localStorage.getItem(STORAGE_KEY_API_URL) || '');
}

function saveLocalRegistration(reg) {
  const regs = getLocalRegistrations();
  if (!regs.some(r => r.registrationId === reg.registrationId)) {
    regs.push({ ...reg, apiUrl: currentApiKey() });
    localStorage.setItem(STORAGE_KEY_LOCAL_REGS, JSON.stringify(regs));
  }
}

/** Cached registrations made against the currently connected API only ('' = demo mode). */
function localRegistrationsForCurrentApi() {
  return getLocalRegistrations().filter(r => normalizeApiUrl(r.apiUrl || '') === currentApiKey());
}

function removeLocalRegistration(regId) {
  const regs = getLocalRegistrations().filter(r => r.registrationId !== regId);
  localStorage.setItem(STORAGE_KEY_LOCAL_REGS, JSON.stringify(regs));
}

/** Drop local-only cache entries that the API already returned. */
function reconcileLocalRegistrations(remoteRegs) {
  const remoteIds = new Set(
    (remoteRegs || [])
      .map(r => String(r.registrationId || r.registration_id || r.id || '').trim())
      .filter(Boolean)
  );
  const remoteKeys = new Set(
    (remoteRegs || []).map(r => {
      const email = String(r.email || '').toLowerCase();
      const eventId = String(r.eventId || r.event_id || r.sourceEventId || '').trim();
      return `${email}|${eventId}`;
    })
  );
  const kept = getLocalRegistrations().filter(r => {
    // Never prune another API's cache — evt ids like "evt-001" repeat across APIs.
    if (normalizeApiUrl(r.apiUrl || '') !== currentApiKey()) return true;
    const id = String(r.registrationId || r.registration_id || r.id || '').trim();
    if (id && remoteIds.has(id)) return false;
    const key = `${String(r.email || '').toLowerCase()}|${String(r.eventId || r.event_id || r.sourceEventId || '').trim()}`;
    return !remoteKeys.has(key);
  });
  localStorage.setItem(STORAGE_KEY_LOCAL_REGS, JSON.stringify(kept));
}

/**
 * Resilient fetch with CORS proxy fallbacks for read-only requests.
 * POST/DELETE always use a direct fetch — proxies cannot reliably forward mutations.
 */
async function fetchWithCorsFallback(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const isMutation = method !== 'GET' && method !== 'HEAD';

  try {
    const res = await fetch(url, options);
    if (res.ok || isMutation) return res;
  } catch (err) {
    if (isMutation) throw err;
    console.warn(`Direct fetch to ${url} failed. Trying CORS fallback...`, err);
  }

  if (isMutation) {
    throw new Error('Network request failed');
  }

  // Proxy Fallback 1: corsproxy.io (GET only)
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const proxyRes = await fetch(proxyUrl, options);
    if (proxyRes.ok) return proxyRes;
  } catch (e) {
    console.warn('corsproxy.io fallback failed:', e);
  }

  // Proxy Fallback 2: api.allorigins.win (GET only)
  try {
    const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const allRes = await fetch(allOriginsUrl);
    if (allRes.ok) {
      const data = await allRes.json();
      if (data && data.contents) {
        let parsed = data.contents;
        try {
          if (typeof data.contents === 'string') parsed = JSON.parse(data.contents);
        } catch {}
        return {
          ok: true,
          status: 200,
          json: async () => parsed,
          text: async () => typeof data.contents === 'string' ? data.contents : JSON.stringify(data.contents)
        };
      }
    }
  } catch (e) {
    console.warn('AllOrigins fallback failed:', e);
  }

  throw new Error('Unable to reach API');
}

// ============================================================
// Mock Data (offline / demo mode)
// ============================================================
const MOCK_EVENTS = [
  {
    eventId: 'evt-101', event_id: 'evt-101',
    name: 'AWS Cloud Tech Summit 2026',
    date: '2026-09-15', capacity: 150, registeredCount: 42,
    description: 'Explore the latest in serverless architectures, DynamoDB optimizations, and AI integration on AWS.'
  },
  {
    eventId: 'evt-102', event_id: 'evt-102',
    name: 'Serverless Python Masterclass',
    date: '2026-10-01', capacity: 80, registeredCount: 78,
    description: 'Deep dive into building high-throughput Python 3.12 Lambdas and Infrastructure-as-Code with SAM.'
  },
  {
    eventId: 'evt-103', event_id: 'evt-103',
    name: 'DevOps & CI/CD Pipeline Workshop',
    date: '2026-10-20', capacity: 50, registeredCount: 15,
    description: 'Hands-on training for GitHub Actions OIDC deployment to AWS without static access keys.'
  }
];

// ============================================================
// SVG Icon Templates
// ============================================================
const ICONS = {
  calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
  location: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
  id: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>',
  check: '<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  error: '<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
};

// ============================================================
// Application Class
// ============================================================
class EventPulseApp {
  constructor() {
    this.apiUrl = normalizeApiUrl(localStorage.getItem(STORAGE_KEY_API_URL) || DEFAULT_API_URL);
    this.events = [];
    this.allRegistrations = [];
    this.currentSearchEmail = '';
    this.currentSearchQuery = '';
    this._pendingConfirm = null;
    /** In-memory seat deltas for registrations made this session before API counts refresh. */
    this.sessionSeatDeltas = {};

    this.initElements();
    this.bindEvents();
    this.initApp();
  }

  // ----------------------------------------------------------
  // DOM References
  // ----------------------------------------------------------
  initElements() {
    this.apiUrlInput = document.getElementById('api-url-input');
    this.btnSaveApiUrl = document.getElementById('btn-save-api-url');
    this.apiStatusBadge = document.getElementById('api-status-badge');
    this.apiStatusText = document.getElementById('api-status-text');

    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');

    this.btnRefreshEvents = document.getElementById('btn-refresh-events');
    this.eventsLoading = document.getElementById('events-loading');
    this.eventsGrid = document.getElementById('events-grid');
    this.eventsEmpty = document.getElementById('events-empty');
    this.eventsEmptyMessage = document.getElementById('events-empty-message');

    this.formSearchEmail = document.getElementById('form-search-email');
    this.searchEmailInput = document.getElementById('search-email-input');
    this.btnClearSearch = document.getElementById('btn-clear-search');
    this.regsLoading = document.getElementById('regs-loading');
    this.regsList = document.getElementById('regs-list');
    this.regsEmpty = document.getElementById('regs-empty');

    this.registerModal = document.getElementById('register-modal');
    this.modalEventTitle = document.getElementById('modal-event-title');
    this.modalEventBadge = document.getElementById('modal-event-badge');
    this.modalEventId = document.getElementById('modal-event-id');
    this.formRegister = document.getElementById('form-register');
    this.regNameInput = document.getElementById('reg-name-input');
    this.regEmailInput = document.getElementById('reg-email-input');
    this.btnCloseModal = document.getElementById('btn-close-modal');
    this.btnCancelModal = document.getElementById('btn-cancel-modal');

    this.confirmDialog = document.getElementById('confirm-dialog');
    this.confirmDialogMessage = document.getElementById('confirm-dialog-message');
    this.btnConfirmYes = document.getElementById('confirm-dialog-confirm');
    this.btnConfirmNo = document.getElementById('confirm-dialog-cancel');

    this.tabRegCount = document.getElementById('tab-reg-count');
  }

  // ----------------------------------------------------------
  // Event Binding
  // ----------------------------------------------------------
  bindEvents() {
    // API connect
    this.btnSaveApiUrl.addEventListener('click', () => {
      const url = normalizeApiUrl(this.apiUrlInput.value);
      this.setApiUrl(url);
      this.checkApiStatusAndFetch();
    });

    this.apiUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.btnSaveApiUrl.click();
      }
    });

    // Tab navigation
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        this.switchTab(targetId, btn);
      });
    });

    // Refresh events
    this.btnRefreshEvents.addEventListener('click', () => this.fetchEvents());

    // Registration form
    this.formRegister.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitRegistration();
    });

    // Modal close
    this.btnCloseModal.addEventListener('click', () => this.closeModal());
    this.btnCancelModal.addEventListener('click', () => this.closeModal());
    this.registerModal.addEventListener('click', (e) => {
      if (e.target === this.registerModal) this.closeModal();
    });

    // Escape to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.registerModal.classList.contains('hidden')) this.closeModal();
        if (!this.confirmDialog.classList.contains('hidden')) this.closeConfirmDialog(false);
      }
    });

    // Preset buttons — connect directly to selected API Gateway URL
    this.presetButtons = document.querySelectorAll('.btn-preset');
    this.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const url = normalizeApiUrl(btn.getAttribute('data-url') || DEFAULT_API_URL);
        this.apiUrlInput.value = url;
        this.setApiUrl(url);
        this.syncPresetButtons();
        this.checkApiStatusAndFetch();
      });
    });

    // Search registrations
    this.formSearchEmail.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = (this.searchEmailInput.value || '').trim();
      this.fetchRegistrations(query);
    });

    if (this.btnClearSearch) {
      this.btnClearSearch.addEventListener('click', () => {
        this.searchEmailInput.value = '';
        this.fetchRegistrations('');
      });
    }

    // Real-time search filtering
    if (this.searchEmailInput) {
      this.searchEmailInput.addEventListener('input', () => {
        const query = (this.searchEmailInput.value || '').trim();
        this.filterAndRenderRegistrations(query);
      });
    }

    // Confirmation dialog buttons
    if (this.btnConfirmYes) {
      this.btnConfirmYes.addEventListener('click', () => this.closeConfirmDialog(true));
    }
    if (this.btnConfirmNo) {
      this.btnConfirmNo.addEventListener('click', () => this.closeConfirmDialog(false));
    }
    if (this.confirmDialog) {
      this.confirmDialog.addEventListener('click', (e) => {
        if (e.target === this.confirmDialog) this.closeConfirmDialog(false);
      });
    }
  }

  // ----------------------------------------------------------
  // Initialization
  // ----------------------------------------------------------
  initApp() {
    if (this.apiUrl) {
      this.apiUrlInput.value = this.apiUrl;
    }
    this.syncPresetButtons();

    if (window.location.protocol === 'file:') {
      this.showToast(
        'Opened from a local file — register/cancel may fail. Use a local server or GitHub Pages for full API access.',
        'error'
      );
    }

    this.checkApiStatusAndFetch();
  }

  syncPresetButtons() {
    if (!this.presetButtons) return;
    this.presetButtons.forEach(btn => {
      const btnUrl = normalizeApiUrl(btn.getAttribute('data-url'));
      btn.classList.toggle('active', btnUrl === this.apiUrl);
    });
  }

  setEmptyStateMessage(message) {
    if (this.eventsEmptyMessage) {
      this.eventsEmptyMessage.textContent = message;
    }
  }

  // ----------------------------------------------------------
  // API URL Management
  // ----------------------------------------------------------
  setApiUrl(url) {
    this.apiUrl = url;
    if (url) {
      localStorage.setItem(STORAGE_KEY_API_URL, url);
    } else {
      localStorage.removeItem(STORAGE_KEY_API_URL);
    }
  }

  // ----------------------------------------------------------
  // Tab Navigation
  // ----------------------------------------------------------
  switchTab(targetSectionId, activeBtn) {
    this.tabButtons.forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
    });
    this.tabContents.forEach(content => {
      content.classList.remove('active');
      content.classList.add('hidden');
    });

    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-selected', 'true');
    const targetSection = document.getElementById(targetSectionId);
    if (targetSection) {
      targetSection.classList.remove('hidden');
      targetSection.classList.add('active');
    }

    if (targetSectionId === 'section-my-registrations') {
      const query = (this.searchEmailInput.value || '').trim();
      this.fetchRegistrations(query);
    }
  }

  // ----------------------------------------------------------
  // API Status Check + Initial Fetch (single network round-trip)
  // ----------------------------------------------------------
  async checkApiStatusAndFetch() {
    this.updateStatusBadge('connecting', 'Connecting…');

    if (!this.apiUrl) {
      this.updateStatusBadge('disconnected', 'Demo Mode');
      this.events = MOCK_EVENTS;
      this.renderEvents(MOCK_EVENTS);
      return;
    }

    // fetchEvents() itself talks to the API and now owns setting the
    // connected/disconnected badge based on the real outcome, so we no
    // longer make a separate throwaway request here before it.
    await this.fetchEvents();
  }

  updateStatusBadge(state, text) {
    this.apiStatusBadge.className = `status-badge ${state === 'connected' ? 'connected' : 'disconnected'}`;
    this.apiStatusText.textContent = text;
  }

  // ----------------------------------------------------------
  // Fetch & Normalize Events
  // ----------------------------------------------------------
  async fetchEvents() {
    this.eventsLoading.classList.remove('hidden');
    this.eventsGrid.classList.add('hidden');
    this.eventsEmpty.classList.add('hidden');

    if (!this.apiUrl) {
      setTimeout(() => {
        this.eventsLoading.classList.add('hidden');
        this.events = MOCK_EVENTS;
        this.renderEvents(MOCK_EVENTS);
      }, 300);
      return;
    }

    try {
      this.setEmptyStateMessage('Connect an API endpoint or check your network connection to load events.');
      const res = await fetchWithCorsFallback(`${this.apiUrl}/events`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = unwrapApiPayload(await res.json());
      const rawList = Array.isArray(data) ? data : (data.events || data.data || data.items || data.results || []);

      this.events = rawList.map(item => {
        const id = String(item.eventId || item.event_id || item.id || item._id || '').trim();
        const name = String(item.eventName || item.name || item.title || 'Untitled Event').trim();
        const sourceId = String(item.sourceEventId || item.source_event_id || id).trim();
        const capacity = Number(item.capacity ?? item.max_capacity ?? item.total_seats ?? item.totalSeats ?? item.seats ?? 100);

        let apiRegCount = 0;
        if (item.registeredCount !== undefined || item.registered_count !== undefined || item.attendees !== undefined || item.attendeeCount !== undefined) {
          apiRegCount = Number(item.registeredCount ?? item.registered_count ?? item.attendees ?? item.attendeeCount ?? 0);
        } else if (item.availableSeats !== undefined || item.available_seats !== undefined || item.availableSpots !== undefined || item.available_spots !== undefined) {
          const avail = Number(item.availableSeats ?? item.available_seats ?? item.availableSpots ?? item.available_spots ?? capacity);
          apiRegCount = Math.max(capacity - avail, 0);
        }

        // Server API Gateway apiRegCount is authoritative when connected to API Gateway.
        // Fall back to local storage count only when running in offline/demo mode.
        const totalRegCount = this.apiUrl ? apiRegCount : getLocalRegistrationCount(id, sourceId);
        const locationStr = item.location || item.venue || item.address || item.place || '';
        const dateStr = item.date ? (item.time ? `${item.date} (${item.time})` : item.date) : 'TBD';

        return {
          ...item,
          eventId: id, event_id: id, id: id,
          eventName: name, name: name,
          location: locationStr,
          date: dateStr,
          providerId: item.providerId || item.provider_id || '',
          sourceEventId: sourceId,
          capacity: capacity,
          registeredCount: totalRegCount
        };
      });

      this.updateStatusBadge('connected', 'Connected');
      this.renderEvents(this.events);
    } catch (err) {
      console.error('Error fetching events:', err);
      this.updateStatusBadge('disconnected', 'Connection Failed');
      this.showToast('Failed to load events from API Gateway', 'error');
      this.events = [];
      this.setEmptyStateMessage(
        'Could not reach the API. Check the URL, network connection, and that the API stage path is correct (e.g. /Prod).'
      );
      this.renderEvents([]);
    } finally {
      this.eventsLoading.classList.add('hidden');
    }
  }

  // ----------------------------------------------------------
  // Render Events Grid
  // ----------------------------------------------------------
  renderEvents(eventsList) {
    this.eventsGrid.innerHTML = '';
    this.eventsLoading.classList.add('hidden');
    this.updateCapacityStory(eventsList);

    if (!eventsList || eventsList.length === 0) {
      this.eventsGrid.classList.add('hidden');
      if (this.providerFilter && this.events.length > 0) {
        this.setEmptyStateMessage('No events matched this provider filter. Try "All providers".');
      }
      this.eventsEmpty.classList.remove('hidden');
      return;
    }

    this.eventsEmpty.classList.add('hidden');
    this.eventsGrid.classList.remove('hidden');

    eventsList.forEach(evt => {
      const card = document.createElement('div');
      card.className = 'event-card';

      const eventId = evt.eventId || evt.event_id || evt.id || evt._id || 'N/A';
      const eventName = evt.eventName || evt.name || evt.title || 'Untitled Event';
      const regCount = Number(evt.registeredCount ?? evt.registered_count ?? evt.attendees ?? evt.attendeeCount ?? 0);
      const capacity = Number(evt.capacity ?? evt.max_capacity ?? evt.total_seats ?? 100);
      const isFull = regCount >= capacity;
      const dateStr = evt.date || 'TBD';
      const locationStr = evt.location || '';

      // Capacity bar
      const pct = capacity > 0 ? Math.min((regCount / capacity) * 100, 100) : 0;
      const capClass = pct >= 90 ? 'cap-high' : pct >= 60 ? 'cap-mid' : 'cap-low';

      // Provider badge
      const providerId = String(evt.providerId || evt.provider_id || '').toLowerCase();
      let providerBadge = '<span class="badge badge-provider-local">Local</span>';
      if (providerId.includes('gloria')) {
        providerBadge = '<span class="badge badge-provider-gloria">Gloria</span>';
      } else if (providerId.includes('accra') || providerId.includes('dawuni')) {
        providerBadge = '<span class="badge badge-provider-dawuni">Dawuni</span>';
      }

      // Description
      const desc = evt.description || evt.summary || (locationStr ? `Location: ${locationStr}` : 'No description available.');

      card.innerHTML = `
        <div>
          <div class="event-card-header">
            <h3 class="event-card-title">${this.escapeHtml(eventName)}</h3>
            <div class="event-card-badges">
              ${providerBadge}
              <span class="badge ${isFull ? 'badge-danger' : 'badge-success'}">${isFull ? 'Full' : 'Open'}</span>
            </div>
          </div>
          <p class="event-card-desc">${this.escapeHtml(desc)}</p>
          <div class="event-card-meta">
            <div class="meta-item">${ICONS.calendar}<span>${dateStr}</span></div>
            ${locationStr ? `<div class="meta-item">${ICONS.location}<span>${this.escapeHtml(locationStr)}</span></div>` : ''}
            <div class="meta-item">${ICONS.id}<span>${eventId}</span></div>
          </div>
          <div class="capacity-bar-track" aria-label="Capacity: ${regCount} of ${capacity}">
            <div class="capacity-bar-fill ${capClass}" style="width: ${pct}%"></div>
          </div>
        </div>
        <div class="event-card-footer">
          <span class="capacity-info">${isFull ? 'Fully booked' : `${capacity - regCount} of ${capacity} seats left`}</span>
          <button class="btn btn-primary btn-register-trigger" ${isFull ? 'disabled' : ''}>
            ${isFull ? 'Sold Out' : 'Register'}
          </button>
        </div>
      `;

      const regBtn = card.querySelector('.btn-register-trigger');
      if (regBtn && !isFull) {
        regBtn.addEventListener('click', () => this.openRegisterModal(evt));
      }

      this.eventsGrid.appendChild(card);
    });
  }

  // ----------------------------------------------------------
  // Update Capacity Stats
  // ----------------------------------------------------------
  updateCapacityStory(eventsList) {
    const events = Array.isArray(eventsList) ? eventsList : [];
    const totalCapacity = events.reduce((sum, event) => sum + Number(event.capacity || 100), 0);
    const totalRegistered = events.reduce((sum, event) => sum + Number(event.registeredCount ?? event.registered_count ?? 0), 0);
    const available = Math.max(totalCapacity - totalRegistered, 0);
    const message = events.length
      ? `${available > 0 ? `${available} seats are still open` : 'Every event is at capacity'} — pick your moment.`
      : 'Connect an event source to see live availability.';

    document.getElementById('hero-available-seats').textContent = events.length ? available : '—';
    document.getElementById('hero-events-count').textContent = events.length ? `${events.length} live events` : 'No live events';
    document.getElementById('stat-events').textContent = events.length || '—';
    document.getElementById('stat-registered').textContent = events.length ? totalRegistered : '—';
    document.getElementById('stat-capacity').textContent = events.length ? totalCapacity : '—';
    document.getElementById('capacity-message').textContent = message;
  }

  // ----------------------------------------------------------
  // Registration Modal
  // ----------------------------------------------------------
  openRegisterModal(evt) {
    const eventId = String(evt.eventId || evt.event_id || evt.id || evt._id || '').trim();
    const name = String(evt.eventName || evt.name || evt.title || 'Event Registration').trim();
    this.selectedProviderId = String(evt.providerId || evt.provider_id || '').trim();
    this.selectedSourceEventId = String(evt.sourceEventId || evt.source_event_id || eventId).trim();
    this.modalEventTitle.textContent = name;
    this.modalEventBadge.textContent = `Event ID: ${eventId || 'N/A'}`;
    this.modalEventId.value = eventId;
    this.regNameInput.value = '';

    // Pre-fill email from last registration
    const lastEmail = localStorage.getItem(STORAGE_KEY_LAST_EMAIL) || '';
    this.regEmailInput.value = lastEmail;

    this.registerModal.classList.remove('hidden');
    document.body.classList.add('modal-open');

    // Focus first empty input
    setTimeout(() => {
      if (this.regNameInput.value === '') {
        this.regNameInput.focus();
      } else if (this.regEmailInput.value === '') {
        this.regEmailInput.focus();
      } else {
        this.regNameInput.focus();
      }
    }, 100);
  }

  closeModal() {
    this.registerModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

  // ----------------------------------------------------------
  // Confirmation Dialog
  // ----------------------------------------------------------
  showConfirmDialog(message) {
    return new Promise((resolve) => {
      this.confirmDialogMessage.textContent = message;
      this.confirmDialog.classList.remove('hidden');
      document.body.classList.add('modal-open');
      this._pendingConfirm = resolve;
      this.btnConfirmYes.focus();
    });
  }

  closeConfirmDialog(confirmed) {
    this.confirmDialog.classList.add('hidden');
    document.body.classList.remove('modal-open');
    if (this._pendingConfirm) {
      this._pendingConfirm(confirmed);
      this._pendingConfirm = null;
    }
  }

  // ----------------------------------------------------------
  // Submit Registration
  // ----------------------------------------------------------
  async submitRegistration() {
    const eventId = this.modalEventId.value;
    const name = this.regNameInput.value.trim();
    const email = this.regEmailInput.value.trim();

    if (!eventId || !name || !email) return;

    this.closeModal();

    if (!this.apiUrl) {
      const demoRegId = `reg-demo-${Date.now()}`;
      saveLocalRegistration({
        registrationId: demoRegId, eventId, event_id: eventId,
        sourceEventId: this.selectedSourceEventId || eventId,
        email, name, createdAt: new Date().toISOString()
      });
      this.adjustSessionSeatDelta(eventId, 1);
      localStorage.setItem(STORAGE_KEY_LAST_EMAIL, email);
      this.currentSearchEmail = email;
      this.searchEmailInput.value = email;
      this.showToast(`Registered successfully for ${eventId}! (Demo Mode)`, 'success');
      this.fetchEvents();
      return;
    }

    try {
      const targetUrl = this.apiUrl || HUB_API_URL;
      let response;
      try {
        response = await fetch(`${targetUrl}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId, event_id: eventId, id: eventId,
            providerId: this.selectedProviderId || undefined,
            sourceEventId: this.selectedSourceEventId || undefined,
            name, email
          })
        });
      } catch (directErr) {
        if (targetUrl !== HUB_API_URL) {
          response = await fetch(`${HUB_API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventId, event_id: eventId, id: eventId,
              providerId: this.selectedProviderId || undefined,
              sourceEventId: this.selectedSourceEventId || undefined,
              name, email
            })
          });
        } else {
          throw directErr;
        }
      }

      const result = unwrapApiPayload(await response.json());
      if (response.ok) {
        const registration = result.registration || result.data || result;
        const regId = registration.registrationId || registration.registration_id || registration.id || result.registration_id || result.registrationId || 'OK';

        saveLocalRegistration({
          registrationId: regId, eventId, event_id: eventId,
          sourceEventId: this.selectedSourceEventId || eventId,
          email, name, createdAt: new Date().toISOString()
        });

        localStorage.setItem(STORAGE_KEY_LAST_EMAIL, email);
        this.currentSearchEmail = email;
        this.searchEmailInput.value = email;
        this.showToast(`Registration confirmed! ID: ${regId}`, 'success');
        this.fetchEvents();
      } else {
        this.showToast(result.error || result.message || 'Registration failed', 'error');
      }
    } catch (err) {
      console.error('Registration error:', err);
      this.showToast('Error connecting to API Gateway', 'error');
    }
  }

  // ----------------------------------------------------------
  // Fetch Registrations
  // ----------------------------------------------------------
  async fetchRegistrations(query = '') {
    this.currentSearchQuery = String(query || '').trim();
    this.regsLoading.classList.remove('hidden');
    this.regsList.classList.add('hidden');
    this.regsEmpty.classList.add('hidden');

    if (!this.apiUrl) {
      setTimeout(() => {
        this.regsLoading.classList.add('hidden');
        const mockRegs = [
          { registrationId: 'reg-demo-99', eventId: 'evt-101', name: 'Alex Johnson', email: 'alex@example.com', timestamp: new Date().toISOString() },
          { registrationId: 'reg-demo-100', eventId: 'evt-102', name: 'Sarah Connor', email: 'sarah@example.com', timestamp: new Date().toISOString() }
        ];
        // Merge in whatever the user has actually registered for locally
        // in this session — otherwise demo-mode sign-ups vanished from
        // "My Registrations" the moment you switched tabs.
        const localRegs = localRegistrationsForCurrentApi();
        const seen = new Set();
        this.allRegistrations = [...localRegs, ...mockRegs].filter(r => {
          const id = r.registrationId || r.registration_id || r.id;
          if (id && seen.has(id)) return false;
          if (id) seen.add(id);
          return true;
        });
        this.filterAndRenderRegistrations(this.currentSearchQuery);
      }, 300);
      return;
    }

    try {
      let remoteRegs = [];
      let parentEmail = '';

      try {
        const resAll = await fetchWithCorsFallback(`${this.apiUrl}/registrations/all`);
        if (resAll.ok) {
          const dataAll = unwrapApiPayload(await resAll.json());
          remoteRegs = Array.isArray(dataAll) ? dataAll : (dataAll.registrations || dataAll.data || dataAll.items || dataAll.results || []);
          if (dataAll && dataAll.email && dataAll.email !== 'all') parentEmail = dataAll.email;
        }
      } catch (e) {
        console.warn('Could not fetch /registrations/all:', e);
      }

      if (this.currentSearchQuery && this.currentSearchQuery.includes('@')) {
        try {
          const resDirect = await fetchWithCorsFallback(`${this.apiUrl}/registrations/${encodeURIComponent(this.currentSearchQuery)}`);
          if (resDirect.ok) {
            const dataDirect = unwrapApiPayload(await resDirect.json());
            const directItems = Array.isArray(dataDirect) ? dataDirect : (dataDirect.registrations || dataDirect.data || dataDirect.items || dataDirect.results || []);
            const directEmail = (dataDirect && dataDirect.email) || this.currentSearchQuery;
            directItems.forEach(item => {
              const itemEmail = item.email || directEmail;
              remoteRegs.push({ ...item, email: itemEmail });
            });
          }
        } catch (e) {
          console.warn('Direct query failed:', e);
        }
      }

      // Always merge remote results with anything tracked locally, instead
      // of only falling back to local storage when the API returned zero
      // rows. Previously, as soon as the API returned *any* registrations,
      // local-only entries (e.g. a registration just submitted, before the
      // backend index caught up) were silently dropped from the list.
      const localRegs = localRegistrationsForCurrentApi();
      const combinedMap = new Map();
      [...remoteRegs, ...localRegs].forEach(item => {
        const id = String(item.registrationId || item.registration_id || item.id || '').trim();
        if (id && !combinedMap.has(id)) {
          combinedMap.set(id, item);
        } else if (!id) {
          combinedMap.set(Math.random().toString(), item);
        }
      });
      const combinedList = Array.from(combinedMap.values());

      reconcileLocalRegistrations(remoteRegs);
      this.allRegistrations = combinedList;
      this.filterAndRenderRegistrations(this.currentSearchQuery, parentEmail);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      this.showToast('Error querying registrations', 'error');
    } finally {
      this.regsLoading.classList.add('hidden');
    }
  }

  // ----------------------------------------------------------
  // Filter & Render Registrations
  // ----------------------------------------------------------
  filterAndRenderRegistrations(query, defaultEmail = '') {
    const q = String(query || '').trim().toLowerCase();
    let list = this.allRegistrations || [];

    if (q && q !== 'all') {
      list = list.filter(reg => {
        const email = String(reg.email || defaultEmail || '').toLowerCase();
        const name = String(reg.name || '').toLowerCase();
        const eventName = String(reg.eventName || '').toLowerCase();
        const regId = String(reg.registrationId || reg.registration_id || reg.id || '').toLowerCase();
        const evtId = String(reg.eventId || reg.event_id || reg.sourceEventId || '').toLowerCase();
        return email.includes(q) || name.includes(q) || eventName.includes(q) || regId.includes(q) || evtId.includes(q);
      });
    }

    this.renderRegistrations(list, defaultEmail);
  }

  // ----------------------------------------------------------
  // Render Registration List
  // ----------------------------------------------------------
  renderRegistrations(regsList, defaultEmail = '') {
    this.regsList.innerHTML = '';

    if (!regsList || regsList.length === 0) {
      this.regsList.classList.add('hidden');
      this.regsEmpty.classList.remove('hidden');
      this.updateRegCount(0);
      return;
    }

    // Deduplicate
    const seenIds = new Set();
    const uniqueList = [];
    regsList.forEach(reg => {
      const regId = String(reg.registrationId || reg.registration_id || reg.id || reg._id || '').trim();
      const providerRegId = String(reg.providerRegistrationId || reg.provider_registration_id || '').trim();
      const isSeen = (regId && seenIds.has(regId)) || (providerRegId && seenIds.has(providerRegId));
      if (!isSeen) {
        if (regId) seenIds.add(regId);
        if (providerRegId) seenIds.add(providerRegId);
        uniqueList.push(reg);
      }
    });

    if (uniqueList.length === 0) {
      this.regsList.classList.add('hidden');
      this.regsEmpty.classList.remove('hidden');
      this.updateRegCount(0);
      return;
    }

    this.regsEmpty.classList.add('hidden');
    this.regsList.classList.remove('hidden');
    this.updateRegCount(uniqueList.length);

    // Count header
    const countEl = document.createElement('div');
    countEl.className = 'regs-count';
    countEl.textContent = `${uniqueList.length} registration${uniqueList.length !== 1 ? 's' : ''} found`;
    this.regsList.appendChild(countEl);

    uniqueList.forEach(reg => {
      const item = document.createElement('div');
      item.className = 'reg-item';

      const regId = reg.registrationId || reg.registration_id || reg.id || reg._id || 'N/A';
      const eventId = String(reg.eventId || reg.event_id || reg.sourceEventId || 'N/A').trim();

      const normId = (id) => {
        const s = String(id || '').trim();
        if (s === 'evt-101') return 'evt-001';
        if (s === 'evt-102') return 'evt-002';
        return s;
      };
      const canonicalRegEvtId = normId(eventId);

      const foundEvt = this.events.find(e => {
        const eId = normId(e.eventId || e.event_id || e.id);
        const sId = normId(e.sourceEventId || e.source_event_id);
        return eId === canonicalRegEvtId || sId === canonicalRegEvtId;
      });
      const eventName = reg.eventName || (foundEvt ? (foundEvt.eventName || foundEvt.name) : null) || `Event: ${eventId}`;
      const email = reg.email || defaultEmail || this.currentSearchEmail || 'N/A';
      const nameStr = reg.name ? String(reg.name).trim() : '';

      // Avatar initials
      const initials = nameStr
        ? nameStr.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
        : email[0].toUpperCase();

      const participantInfo = nameStr && nameStr.toLowerCase() !== 'participant'
        ? `<strong>${this.escapeHtml(nameStr)}</strong> · ${this.escapeHtml(email)}`
        : `<strong>${this.escapeHtml(email)}</strong>`;

      const dateVal = reg.createdAt || reg.registered_at || reg.timestamp;

      item.innerHTML = `
        <div class="reg-item-content">
          <div class="reg-avatar" aria-hidden="true">${initials}</div>
          <div class="reg-info">
            <h4>${this.escapeHtml(eventName)}</h4>
            <div class="reg-meta">
              <span>${participantInfo}</span>
              <span>ID: <code>${this.escapeHtml(regId)}</code></span>
              ${dateVal ? `<span>${new Date(dateVal).toLocaleDateString()}</span>` : ''}
            </div>
          </div>
        </div>
        <button class="btn btn-danger btn-cancel-reg" data-reg-id="${this.escapeHtml(regId)}">
          Cancel
        </button>
      `;

      const cancelBtn = item.querySelector('.btn-cancel-reg');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.cancelRegistration(regId));
      }

      this.regsList.appendChild(item);
    });
  }

  updateRegCount(count) {
    if (this.tabRegCount) {
      this.tabRegCount.textContent = count > 0 ? count : '';
    }
  }

  // ----------------------------------------------------------
  // Cancel Registration
  // ----------------------------------------------------------
  async cancelRegistration(registrationId) {
    const confirmed = await this.showConfirmDialog(
      `Cancel registration ${registrationId}? This action cannot be undone.`
    );
    if (!confirmed) return;

    if (!this.apiUrl) {
      removeLocalRegistration(registrationId);
      const cancelled = this.allRegistrations.find(r =>
        String(r.registrationId || r.registration_id || r.id || '') === String(registrationId)
      );
      if (cancelled) {
        this.adjustSessionSeatDelta(cancelled.eventId || cancelled.event_id, -1);
      }
      this.showToast(`Registration ${registrationId} cancelled (Demo Mode)`, 'success');
      this.fetchRegistrations(this.currentSearchEmail);
      return;
    }

    try {
      const encodedId = encodeURIComponent(registrationId);
      const targetUrl = this.apiUrl || HUB_API_URL;
      const res = await fetch(`${targetUrl}/registration/${encodedId}`, { method: 'DELETE' });

      if (res.ok) {
        removeLocalRegistration(registrationId);
        this.showToast('Registration cancelled successfully', 'success');
        this.fetchEvents();
        this.fetchRegistrations(this.currentSearchEmail);
      } else {
        const errData = unwrapApiPayload(await res.json());
        this.showToast(errData.error || errData.message || 'Failed to cancel', 'error');
      }
    } catch (err) {
      console.error('Cancel error:', err);
      this.showToast('Error sending DELETE request', 'error');
    }
  }

  // ----------------------------------------------------------
  // Toast Notifications
  // ----------------------------------------------------------
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? ICONS.check : ICONS.error;
    toast.innerHTML = `${icon}<span>${this.escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px) scale(0.96)';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // ----------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------
  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  window.app = new EventPulseApp();
});