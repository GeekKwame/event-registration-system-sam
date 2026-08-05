/**
 * QueueLess Frontend Application
 * Interacts directly with AWS SAM API Gateway & Lambda Handlers
 */

// Preserve existing saved API Gateway URLs from the EventPulse prototype.
const STORAGE_KEY_API_URL = 'eventpulse_api_url';
const DEFAULT_API_URL = 'http://127.0.0.1:3000'; // Default SAM Local endpoint

// Sample Mock Data (used if API connection is not configured or offline)
const MOCK_EVENTS = [
  {
    eventId: 'evt-101',
    name: 'AWS Cloud Tech Summit 2026',
    date: '2026-09-15',
    capacity: 150,
    registeredCount: 42,
    description: 'Explore the latest in serverless architectures, DynamoDB optimizations, and AI integration on AWS.'
  },
  {
    eventId: 'evt-102',
    name: 'Serverless Python Masterclass',
    date: '2026-10-01',
    capacity: 80,
    registeredCount: 78,
    description: 'Deep dive into building high-throughput Python 3.12 Lambdas and Infrastructure-as-Code with SAM.'
  },
  {
    eventId: 'evt-103',
    name: 'DevOps & CI/CD Pipeline Workshop',
    date: '2026-10-20',
    capacity: 50,
    registeredCount: 15,
    description: 'Hands-on training for GitHub Actions OIDC deployment to AWS without static access keys.'
  }
];

class EventPulseApp {
  constructor() {
    this.apiUrl = localStorage.getItem(STORAGE_KEY_API_URL) || '';
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
      const url = this.apiUrlInput.value.trim().replace(/\/+$/, '');
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

    // Search Registrations
    this.formSearchEmail.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = this.searchEmailInput.value.trim() || 'all';
      this.fetchRegistrations(email);
    });
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
      const email = (this.searchEmailInput.value || '').trim() || 'all';
      this.fetchRegistrations(email);
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
      const data = await res.json();
      this.events = Array.isArray(data) ? data : (data.events || []);
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

      const regCount = evt.registeredCount || 0;
      const capacity = evt.capacity || 100;
      const isFull = regCount >= capacity;

      card.innerHTML = `
        <div>
          <div class="event-card-header">
            <h3 class="event-card-title">${this.escapeHtml(evt.eventName || evt.name || 'Untitled Event')}</h3>
            <span class="badge ${isFull ? '' : 'badge-success'}">${isFull ? 'Full' : 'Open'}</span>
          </div>
          <p class="event-card-desc">${this.escapeHtml(evt.description || evt.summary || (evt.status ? `Status: ${evt.status}` : 'No description available.'))}</p>
          <div class="event-card-meta">
            <div class="meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <span>Date: ${evt.date || 'TBD'}</span>
            </div>
            <div class="meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2H5z"/></svg>
              <span>Event ${evt.eventId}</span>
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
    const totalRegistered = events.reduce((sum, event) => sum + Number(event.registeredCount || 0), 0);
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
    this.modalEventTitle.textContent = evt.eventName || evt.name || 'Event Registration';
    this.modalEventBadge.textContent = `Event ID: ${evt.eventId}`;
    this.modalEventId.value = evt.eventId;
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
        body: JSON.stringify({ eventId, name, email })
      });

      const result = await response.json();
      if (response.ok) {
        this.showToast(`Registration Successful! Reg ID: ${result.registrationId || 'OK'}`, 'success');
        this.fetchEvents(); // refresh counts
      } else {
        this.showToast(result.error || result.message || 'Registration failed', 'error');
      }
    } catch (err) {
      console.error('Registration error:', err);
      this.showToast('Error connecting to API Gateway endpoint', 'error');
    }
  }

  async fetchRegistrations(email) {
    this.currentSearchEmail = email;
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
            name: 'Demo User',
            email: email,
            timestamp: new Date().toISOString()
          }
        ];
        this.renderRegistrations(mockRegs);
      }, 400);
      return;
    }

    try {
      const res = await fetch(`${this.apiUrl}/registrations/${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const regs = Array.isArray(data) ? data : (data.registrations || []);
      this.renderRegistrations(regs);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      this.showToast('Error querying EmailIndex GSI', 'error');
    } finally {
      this.regsLoading.classList.add('hidden');
    }
  }

  renderRegistrations(regsList) {
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

      item.innerHTML = `
        <div class="reg-info">
          <h4>${this.escapeHtml(reg.eventName || `Event ID: ${reg.eventId}`)}</h4>
          <div class="reg-meta">
            <span>Participant: <strong>${this.escapeHtml(reg.name || 'Participant')}</strong> (${this.escapeHtml(reg.email || 'N/A')})</span>
            <span>Registration ID: <code>${reg.registrationId}</code></span>
            ${reg.createdAt ? `<span>Date: ${new Date(reg.createdAt).toLocaleDateString()}</span>` : ''}
          </div>
        </div>
        <button class="btn btn-danger btn-cancel-reg" data-reg-id="${reg.registrationId}">
          Cancel Registration
        </button>
      `;

      const cancelBtn = item.querySelector('.btn-cancel-reg');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.cancelRegistration(reg.registrationId));
      }

      this.regsList.appendChild(item);
    });
  }

  async cancelRegistration(registrationId) {
    if (!confirm(`Are you sure you want to cancel registration ${registrationId}?`)) {
      return;
    }

    if (!this.apiUrl) {
      this.showToast(`Registration ${registrationId} cancelled (Demo Mode)`, 'success');
      this.fetchRegistrations(this.currentSearchEmail);
      return;
    }

    try {
      const res = await fetch(`${this.apiUrl}/registration/${registrationId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        this.showToast('Registration cancelled successfully!', 'success');
        this.fetchRegistrations(this.currentSearchEmail);
      } else {
        const errData = await res.json();
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
