/**
 * QueueLess Frontend Application
 * Interacts directly with AWS SAM API Gateway & Lambda Handlers
 */

// Store a user-selected endpoint without losing the working default.
const STORAGE_KEY_API_URL = 'eventpulse_api_url';
const STORAGE_KEY_LAST_EMAIL = 'eventpulse_last_registration_email';

// Default API Gateway endpoint provided by user
const DEFAULT_API_URL = 'https://mmrq6ebalh.execute-api.us-east-1.amazonaws.com';

const STORAGE_KEY_LOCAL_REGS = 'eventpulse_local_registrations_store';

function normalizeApiUrl(value) {
  // Accept URLs pasted from prose/Markdown, where a trailing comma is common.
  return String(value || '').trim().replace(/[,\s]+$/, '').replace(/\/+$/, '');
}

function unwrapApiPayload(payload) {
  // Supports direct JSON responses and API Gateway/Lambda proxy envelopes.
  if (payload && typeof payload.body === 'string') {
    try {
      return JSON.parse(payload.body);
    } catch {
      return payload;
    }
  }
  return payload;
}

function getLocalRegistrations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_LOCAL_REGS) || '[]');
  } catch {
    return [];
  }
}

function saveLocalRegistration(reg) {
  const regs = getLocalRegistrations();
  if (!regs.some(r => r.registrationId === reg.registrationId)) {
    regs.push(reg);
    localStorage.setItem(STORAGE_KEY_LOCAL_REGS, JSON.stringify(regs));
  }
}

function removeLocalRegistration(regId) {
  const regs = getLocalRegistrations().filter(r => r.registrationId !== regId);
  localStorage.setItem(STORAGE_KEY_LOCAL_REGS, JSON.stringify(regs));
}

function getLocalRegistrationCount(eventId, sourceEventId) {
  const regs = getLocalRegistrations();
  return regs.filter(r => {
    const eId = String(eventId || '');
    const sId = String(sourceEventId || '');
    const rId = String(r.eventId || r.event_id || '');
    const rSrcId = String(r.sourceEventId || r.source_event_id || '');
    return (eId && (rId === eId || rSrcId === eId)) || (sId && (rId === sId || rSrcId === sId));
  }).length;
}

// Sample Mock Data (used if API connection is not configured or offline)
const MOCK_EVENTS = [
  {
    eventId: 'evt-101',
    event_id: 'evt-101',
    name: 'AWS Cloud Tech Summit 2026',
    date: '2026-09-15',
    capacity: 150,
    registeredCount: 42,
    description: 'Explore the latest in serverless architectures, DynamoDB optimizations, and AI integration on AWS.'
  },
  {
    eventId: 'evt-102',
    event_id: 'evt-102',
    name: 'Serverless Python Masterclass',
    date: '2026-10-01',
    capacity: 80,
    registeredCount: 78,
    description: 'Deep dive into building high-throughput Python 3.12 Lambdas and Infrastructure-as-Code with SAM.'
  },
  {
    eventId: 'evt-103',
    event_id: 'evt-103',
    name: 'DevOps & CI/CD Pipeline Workshop',
    date: '2026-10-20',
    capacity: 50,
    registeredCount: 15,
    description: 'Hands-on training for GitHub Actions OIDC deployment to AWS without static access keys.'
  }
];

class EventPulseApp {
  constructor() {
    this.apiUrl = normalizeApiUrl(localStorage.getItem(STORAGE_KEY_API_URL) || DEFAULT_API_URL);
    this.events = [];
    this.currentSearchEmail = '';
    
    this.initElements();
    this.bindEvents();
    this.initApp();
  }

  initElements() {
    // Inputs & Badges
    this.apiUrlInput = document.getElementById('api-url-input');
    this.btnSaveApiUrl = document.getElementById('btn-save-api-url');
    this.apiStatusBadge = document.getElementById('api-status-badge');
    this.apiStatusText = document.getElementById('api-status-text');

    // Navigation Tabs
    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');

    // Events Grid
    this.btnRefreshEvents = document.getElementById('btn-refresh-events');
    this.eventsLoading = document.getElementById('events-loading');
    this.eventsGrid = document.getElementById('events-grid');
    this.eventsEmpty = document.getElementById('events-empty');

    // Search & Registrations
    this.formSearchEmail = document.getElementById('form-search-email');
    this.searchEmailInput = document.getElementById('search-email-input');
    this.btnClearSearch = document.getElementById('btn-clear-search');
    this.regsLoading = document.getElementById('regs-loading');
    this.regsList = document.getElementById('regs-list');
    this.regsEmpty = document.getElementById('regs-empty');

    // Modal
    this.registerModal = document.getElementById('register-modal');
    this.modalEventTitle = document.getElementById('modal-event-title');
    this.modalEventBadge = document.getElementById('modal-event-badge');
    this.modalEventId = document.getElementById('modal-event-id');
    this.formRegister = document.getElementById('form-register');
    this.regNameInput = document.getElementById('reg-name-input');
    this.regEmailInput = document.getElementById('reg-email-input');
    this.btnCloseModal = document.getElementById('btn-close-modal');
    this.btnCancelModal = document.getElementById('btn-cancel-modal');
  }

  bindEvents() {
    // Save API URL
    this.btnSaveApiUrl.addEventListener('click', () => {
      const url = normalizeApiUrl(this.apiUrlInput.value);
      this.setApiUrl(url);
      this.checkApiStatusAndFetch();
    });

    // Tab Navigation
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetId = btn.getAttribute('data-tab');
        this.switchTab(targetId, btn);
      });
    });

    // Refresh Events
    this.btnRefreshEvents.addEventListener('click', () => {
      this.fetchEvents();
    });

    // Registration Form Submit
    this.formRegister.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitRegistration();
    });

    // Modal Close
    this.btnCloseModal.addEventListener('click', () => this.closeModal());
    this.btnCancelModal.addEventListener('click', () => this.closeModal());

    // Search Registrations Submit
    this.formSearchEmail.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = (this.searchEmailInput.value || '').trim();
      this.fetchRegistrations(query);
    });

    // Clear Search Button
    if (this.btnClearSearch) {
      this.btnClearSearch.addEventListener('click', () => {
        this.searchEmailInput.value = '';
        this.fetchRegistrations('');
      });
    }

    // Real-time instant search filtering as user types
    if (this.searchEmailInput) {
      this.searchEmailInput.addEventListener('input', () => {
        const query = (this.searchEmailInput.value || '').trim();
        this.filterAndRenderRegistrations(query);
      });
    }
  }

  initApp() {
    if (this.apiUrl) {
      this.apiUrlInput.value = this.apiUrl;
    }
    this.checkApiStatusAndFetch();
  }

  setApiUrl(url) {
    this.apiUrl = url;
    if (url) {
      localStorage.setItem(STORAGE_KEY_API_URL, url);
    } else {
      localStorage.removeItem(STORAGE_KEY_API_URL);
    }
  }

  switchTab(targetSectionId, activeBtn) {
    this.tabButtons.forEach(btn => btn.classList.remove('active'));
    this.tabContents.forEach(content => {
      content.classList.remove('active');
      content.classList.add('hidden');
    });

    activeBtn.classList.add('active');
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

  async checkApiStatusAndFetch() {
    this.updateStatusBadge('connecting', 'Connecting...');
    
    if (!this.apiUrl) {
      this.updateStatusBadge('disconnected', 'Mock Mode (No API URL)');
      this.renderEvents(MOCK_EVENTS);
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/events`, { method: 'GET' });
      if (response.ok) {
        this.updateStatusBadge('connected', 'API Connected');
        this.fetchEvents();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn('API connection failed, falling back to mock mode:', err);
      this.updateStatusBadge('disconnected', 'API Offline (Showing Demo Data)');
      this.renderEvents(MOCK_EVENTS);
    }
  }

  updateStatusBadge(state, text) {
    this.apiStatusBadge.className = `status-badge ${state === 'connected' ? 'connected' : 'disconnected'}`;
    this.apiStatusText.textContent = text;
  }

  async fetchEvents() {
    this.eventsLoading.classList.remove('hidden');
    this.eventsGrid.classList.add('hidden');
    this.eventsEmpty.classList.add('hidden');

    if (!this.apiUrl) {
      setTimeout(() => {
        this.eventsLoading.classList.add('hidden');
        this.renderEvents(MOCK_EVENTS);
      }, 300);
      return;
    }

    try {
      const res = await fetch(`${this.apiUrl}/events`);
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
        } else if (item.availableSeats !== undefined || item.available_seats !== undefined) {
          const avail = Number(item.availableSeats ?? item.available_seats ?? capacity);
          apiRegCount = Math.max(capacity - avail, 0);
        }

        const localCount = getLocalRegistrationCount(id, sourceId);
        const totalRegCount = Math.max(apiRegCount, localCount);

        const locationStr = item.location || item.venue || item.address || item.place || '';
        const dateStr = item.date ? (item.time ? `${item.date} (${item.time})` : item.date) : 'TBD';

        return {
          ...item,
          eventId: id,
          event_id: id,
          id: id,
          eventName: name,
          name: name,
          location: locationStr,
          date: dateStr,
          providerId: item.providerId || item.provider_id || '',
          sourceEventId: sourceId,
          capacity: capacity,
          registeredCount: totalRegCount
        };
      });

      this.renderEvents(this.events);
    } catch (err) {
      console.error('Error fetching events:', err);
      this.showToast('Failed to load events from API Gateway', 'error');
      this.renderEvents(MOCK_EVENTS);
    } finally {
      this.eventsLoading.classList.add('hidden');
    }
  }

  renderEvents(eventsList) {
    this.eventsGrid.innerHTML = '';
    this.eventsLoading.classList.add('hidden');
    this.updateCapacityStory(eventsList);
    if (!eventsList || eventsList.length === 0) {
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

      card.innerHTML = `
        <div>
          <div class="event-card-header">
            <h3 class="event-card-title">${this.escapeHtml(eventName)}</h3>
            <span class="badge ${isFull ? '' : 'badge-success'}">${isFull ? 'Full' : 'Open'}</span>
          </div>
          <p class="event-card-desc">${this.escapeHtml(evt.description || evt.summary || (evt.location ? `Location: ${evt.location}` : (evt.status ? `Status: ${evt.status}` : 'No description available.')))}</p>
          <div class="event-card-meta">
            <div class="meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <span>Date: ${dateStr}</span>
            </div>
            <div class="meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2H5z"/></svg>
              <span>Event ID: ${eventId}</span>
            </div>
          </div>
        </div>
        <div class="event-card-footer">
          <span class="capacity-info">${isFull ? 'Every seat claimed' : `${capacity - regCount} seats left`}</span>
          <button class="btn btn-primary btn-register-trigger" ${isFull ? 'disabled' : ''}>
            ${isFull ? 'Sold Out' : 'Register Now'}
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

  openRegisterModal(evt) {
    const eventId = String(evt.eventId || evt.event_id || evt.id || evt._id || '').trim();
    const name = String(evt.eventName || evt.name || evt.title || 'Event Registration').trim();
    this.selectedProviderId = String(evt.providerId || evt.provider_id || '').trim();
    this.selectedSourceEventId = String(evt.sourceEventId || evt.source_event_id || eventId).trim();
    this.modalEventTitle.textContent = name;
    this.modalEventBadge.textContent = `Event ID: ${eventId || 'N/A'}`;
    this.modalEventId.value = eventId;
    this.regNameInput.value = '';
    this.regEmailInput.value = '';
    
    this.registerModal.classList.remove('hidden');
  }

  closeModal() {
    this.registerModal.classList.add('hidden');
  }

  async submitRegistration() {
    const eventId = this.modalEventId.value;
    const name = this.regNameInput.value.trim();
    const email = this.regEmailInput.value.trim();

    if (!eventId || !name || !email) return;

    this.closeModal();

    if (!this.apiUrl) {
      // Mock Success Response
      this.showToast(`Registered successfully for ${eventId}! (Demo Mode)`, 'success');
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          event_id: eventId,
          id: eventId,
          providerId: this.selectedProviderId || undefined,
          sourceEventId: this.selectedSourceEventId || undefined,
          name,
          email
        })
      });

      const result = unwrapApiPayload(await response.json());
      if (response.ok) {
        const registration = result.registration || result.data || result;
        const regId = registration.registrationId || registration.registration_id || registration.id || result.registration_id || result.registrationId || 'OK';

        saveLocalRegistration({
          registrationId: regId,
          eventId: eventId,
          event_id: eventId,
          sourceEventId: this.selectedSourceEventId || eventId,
          email: email,
          name: name,
          createdAt: new Date().toISOString()
        });

        localStorage.setItem(STORAGE_KEY_LAST_EMAIL, email);
        this.currentSearchEmail = email;
        this.searchEmailInput.value = email;
        this.showToast(`Registration Successful! Reg ID: ${regId}`, 'success');
        this.fetchEvents(); // refresh counts
      } else {
        this.showToast(result.error || result.message || 'Registration failed', 'error');
      }
    } catch (err) {
      console.error('Registration error:', err);
      this.showToast('Error connecting to API Gateway endpoint', 'error');
    }
  }

  async fetchRegistrations(query = '') {
    this.currentSearchQuery = String(query || '').trim();
    this.regsLoading.classList.remove('hidden');
    this.regsList.classList.add('hidden');
    this.regsEmpty.classList.add('hidden');

    if (!this.apiUrl) {
      setTimeout(() => {
        this.regsLoading.classList.add('hidden');
        const mockRegs = [
          {
            registrationId: 'reg-demo-99',
            eventId: 'evt-101',
            name: 'Alex Johnson',
            email: 'alex@example.com',
            timestamp: new Date().toISOString()
          },
          {
            registrationId: 'reg-demo-100',
            eventId: 'evt-102',
            name: 'Sarah Connor',
            email: 'sarah@example.com',
            timestamp: new Date().toISOString()
          }
        ];
        this.allRegistrations = mockRegs;
        this.filterAndRenderRegistrations(this.currentSearchQuery);
      }, 300);
      return;
    }

    try {
      let remoteRegs = [];
      let parentEmail = '';

      // Fetch all registrations from API Gateway endpoint
      try {
        const resAll = await fetch(`${this.apiUrl}/registrations/all`);
        if (resAll.ok) {
          const dataAll = unwrapApiPayload(await resAll.json());
          remoteRegs = Array.isArray(dataAll) ? dataAll : (dataAll.registrations || dataAll.data || dataAll.items || dataAll.results || []);
          if (dataAll && dataAll.email) parentEmail = dataAll.email;
        }
      } catch (e) {
        console.warn('Could not fetch /registrations/all:', e);
      }

      // If specific email is searched and not present in remote list, perform targeted lookup
      if (this.currentSearchQuery && this.currentSearchQuery.includes('@')) {
        try {
          const resDirect = await fetch(`${this.apiUrl}/registrations/${encodeURIComponent(this.currentSearchQuery)}`);
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

      const localRegs = getLocalRegistrations();

      // Deduplicate remote and local registrations by registrationId
      const combinedMap = new Map();
      
      [...remoteRegs, ...localRegs].forEach(item => {
        const id = String(item.registrationId || item.registration_id || item.id || '').trim();
        if (id && !combinedMap.has(id)) {
          combinedMap.set(id, item);
        } else if (!id) {
          combinedMap.set(Math.random().toString(), item);
        }
      });

      this.allRegistrations = Array.from(combinedMap.values());
      this.filterAndRenderRegistrations(this.currentSearchQuery, parentEmail);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      this.showToast('Error querying registrations endpoint', 'error');
    } finally {
      this.regsLoading.classList.add('hidden');
    }
  }

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

  renderRegistrations(regsList, defaultEmail = '') {
    this.regsList.innerHTML = '';
    if (!regsList || regsList.length === 0) {
      this.regsEmpty.classList.remove('hidden');
      return;
    }

    this.regsEmpty.classList.add('hidden');
    this.regsList.classList.remove('hidden');

    regsList.forEach(reg => {
      const item = document.createElement('div');
      item.className = 'reg-item';

      const regId = reg.registrationId || reg.registration_id || reg.id || reg._id || 'N/A';
      const eventId = String(reg.eventId || reg.event_id || reg.sourceEventId || 'N/A').trim();
      
      const foundEvt = this.events.find(e => 
        String(e.eventId) === eventId || 
        String(e.event_id) === eventId || 
        String(e.sourceEventId) === eventId || 
        String(e.id) === eventId
      );
      const eventName = reg.eventName || (foundEvt ? (foundEvt.eventName || foundEvt.name) : null) || `Event ID: ${eventId}`;

      const email = reg.email || defaultEmail || this.currentSearchEmail || 'N/A';
      const nameStr = reg.name ? String(reg.name).trim() : '';
      const participantInfo = nameStr && nameStr.toLowerCase() !== 'participant'
        ? `<strong>${this.escapeHtml(nameStr)}</strong> (${this.escapeHtml(email)})` 
        : `<strong>${this.escapeHtml(email)}</strong>`;

      const dateVal = reg.createdAt || reg.registered_at || reg.timestamp;

      item.innerHTML = `
        <div class="reg-info">
          <h4>${this.escapeHtml(eventName)}</h4>
          <div class="reg-meta">
            <span>Participant: ${participantInfo}</span>
            <span>Registration ID: <code>${this.escapeHtml(regId)}</code></span>
            ${dateVal ? `<span>Date: ${new Date(dateVal).toLocaleDateString()}</span>` : ''}
          </div>
        </div>
        <button class="btn btn-danger btn-cancel-reg" data-reg-id="${this.escapeHtml(regId)}">
          Cancel Registration
        </button>
      `;

      const cancelBtn = item.querySelector('.btn-cancel-reg');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.cancelRegistration(regId));
      }

      this.regsList.appendChild(item);
    });
  }

  async cancelRegistration(registrationId) {
    if (!confirm(`Are you sure you want to cancel registration ${registrationId}?`)) {
      return;
    }

    if (!this.apiUrl) {
      removeLocalRegistration(registrationId);
      this.showToast(`Registration ${registrationId} cancelled (Demo Mode)`, 'success');
      this.fetchRegistrations(this.currentSearchEmail);
      return;
    }

    try {
      const encodedId = encodeURIComponent(registrationId);
      const res = await fetch(`${this.apiUrl}/registration/${encodedId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        removeLocalRegistration(registrationId);
        this.showToast('Registration cancelled successfully!', 'success');
        this.fetchEvents();
        this.fetchRegistrations(this.currentSearchEmail);
      } else {
        const errData = unwrapApiPayload(await res.json());
        this.showToast(errData.error || errData.message || 'Failed to cancel registration', 'error');
      }
    } catch (err) {
      console.error('Cancel error:', err);
      this.showToast('Error sending DELETE request to API Gateway', 'error');
    }
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Initialize Application when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new EventPulseApp();
});
