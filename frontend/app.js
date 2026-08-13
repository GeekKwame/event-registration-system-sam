/**
 * Event-Connect frontend
 * Calls same-origin /api paths on CloudFront. API Gateway URLs are never used in the browser.
 */

const STORAGE_KEY_LAST_EMAIL = 'eventpulse_last_registration_email';
const API_BASE = '/api';

function unwrapApiPayload(payload) {
  if (payload && typeof payload.body === 'string') {
    try { return JSON.parse(payload.body); } catch { return payload; }
  }
  return payload;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  let payload = {};
  try {
    payload = unwrapApiPayload(await response.json());
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

const ICONS = {
  calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
  location: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
  id: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>',
  check: '<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  error: '<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
};

class EventPulseApp {
  constructor() {
    this.events = [];
    this.allRegistrations = [];
    this.currentSearchEmail = '';
    this._pendingConfirm = null;
    this.initElements();
    this.bindEvents();
    this.initApp();
  }

  initElements() {
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

  bindEvents() {
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.getAttribute('data-tab'), btn);
      });
    });

    this.btnRefreshEvents.addEventListener('click', () => this.fetchEvents());
    this.formRegister.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitRegistration();
    });
    this.btnCloseModal.addEventListener('click', () => this.closeModal());
    this.btnCancelModal.addEventListener('click', () => this.closeModal());
    this.registerModal.addEventListener('click', (e) => {
      if (e.target === this.registerModal) this.closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.registerModal.classList.contains('hidden')) this.closeModal();
        if (!this.confirmDialog.classList.contains('hidden')) this.closeConfirmDialog(false);
      }
    });

    this.formSearchEmail.addEventListener('submit', (e) => {
      e.preventDefault();
      this.fetchRegistrations((this.searchEmailInput.value || '').trim());
    });

    this.btnClearSearch.addEventListener('click', () => {
      this.searchEmailInput.value = '';
      this.fetchRegistrations('');
    });

    this.btnConfirmYes.addEventListener('click', () => this.closeConfirmDialog(true));
    this.btnConfirmNo.addEventListener('click', () => this.closeConfirmDialog(false));
    this.confirmDialog.addEventListener('click', (e) => {
      if (e.target === this.confirmDialog) this.closeConfirmDialog(false);
    });
  }

  initApp() {
    const lastEmail = localStorage.getItem(STORAGE_KEY_LAST_EMAIL) || '';
    if (lastEmail) this.searchEmailInput.value = lastEmail;
    this.fetchEvents();
  }

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
      this.fetchRegistrations((this.searchEmailInput.value || '').trim());
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
    this.updateStatusBadge('connecting', 'Connecting…');

    try {
      const data = await apiFetch('/events');
      const rawList = Array.isArray(data) ? data : (data.events || []);
      this.events = rawList.map(item => {
        const id = String(item.eventId || item.event_id || item.id || '').trim();
        const name = String(item.eventName || item.name || item.title || 'Untitled Event').trim();
        const capacity = Number(item.capacity ?? item.max_capacity ?? item.total_seats ?? 100);
        const apiRegCount = Number(item.registeredCount ?? item.registered_count ?? item.attendees ?? 0);
        return {
          ...item,
          eventId: id,
          eventName: name,
          name,
          location: item.location || item.venue || '',
          date: item.date ? (item.time ? `${item.date} (${item.time})` : item.date) : 'TBD',
          providerId: item.providerId || '',
          sourceEventId: item.sourceEventId || id,
          capacity,
          registeredCount: apiRegCount,
        };
      });
      this.updateStatusBadge('connected', 'Live');
      this.renderEvents(this.events);
    } catch (err) {
      console.error('Error fetching events:', err);
      this.updateStatusBadge('disconnected', 'Unavailable');
      this.showToast('Could not load events', 'error');
      this.events = [];
      this.eventsEmptyMessage.textContent = 'The event service is unavailable. Refresh to try again.';
      this.renderEvents([]);
    } finally {
      this.eventsLoading.classList.add('hidden');
    }
  }

  renderEvents(eventsList) {
    this.eventsGrid.innerHTML = '';
    this.updateCapacityStory(eventsList);

    if (!eventsList || eventsList.length === 0) {
      this.eventsGrid.classList.add('hidden');
      this.eventsEmpty.classList.remove('hidden');
      return;
    }

    this.eventsEmpty.classList.add('hidden');
    this.eventsGrid.classList.remove('hidden');

    eventsList.forEach(evt => {
      const card = document.createElement('div');
      card.className = 'event-card';
      const eventId = evt.eventId || 'N/A';
      const eventName = evt.eventName || 'Untitled Event';
      const regCount = Number(evt.registeredCount || 0);
      const capacity = Number(evt.capacity || 100);
      const isFull = capacity > 0 && regCount >= capacity;
      const pct = capacity > 0 ? Math.min((regCount / capacity) * 100, 100) : 0;
      const capClass = pct >= 90 ? 'cap-high' : pct >= 60 ? 'cap-mid' : 'cap-low';
      const desc = evt.description || evt.summary || (evt.location ? `Location: ${evt.location}` : 'No description available.');

      card.innerHTML = `
        <div>
          <div class="event-card-header">
            <h3 class="event-card-title">${this.escapeHtml(eventName)}</h3>
            <div class="event-card-badges">
              <span class="badge ${isFull ? 'badge-danger' : 'badge-success'}">${isFull ? 'Full' : 'Open'}</span>
            </div>
          </div>
          <p class="event-card-desc">${this.escapeHtml(desc)}</p>
          <div class="event-card-meta">
            <div class="meta-item">${ICONS.calendar}<span>${this.escapeHtml(evt.date || 'TBD')}</span></div>
            ${evt.location ? `<div class="meta-item">${ICONS.location}<span>${this.escapeHtml(evt.location)}</span></div>` : ''}
            <div class="meta-item">${ICONS.id}<span>${this.escapeHtml(eventId)}</span></div>
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

  updateCapacityStory(eventsList) {
    const events = Array.isArray(eventsList) ? eventsList : [];
    const totalCapacity = events.reduce((sum, event) => sum + Number(event.capacity || 100), 0);
    const totalRegistered = events.reduce((sum, event) => sum + Number(event.registeredCount || 0), 0);
    const available = Math.max(totalCapacity - totalRegistered, 0);
    const message = events.length
      ? `${available > 0 ? `${available} seats are still open` : 'Every event is at capacity'} — pick your moment.`
      : 'Event availability will appear here once the catalog loads.';

    document.getElementById('hero-available-seats').textContent = events.length ? available : '—';
    document.getElementById('hero-events-count').textContent = events.length ? `${events.length} live events` : 'No live events';
    document.getElementById('stat-events').textContent = events.length || '—';
    document.getElementById('stat-registered').textContent = events.length ? totalRegistered : '—';
    document.getElementById('stat-capacity').textContent = events.length ? totalCapacity : '—';
    document.getElementById('capacity-message').textContent = message;
  }

  openRegisterModal(evt) {
    const eventId = String(evt.eventId || '').trim();
    this.selectedProviderId = String(evt.providerId || '').trim();
    this.selectedSourceEventId = String(evt.sourceEventId || eventId).trim();
    this.modalEventTitle.textContent = String(evt.eventName || 'Event Registration').trim();
    this.modalEventBadge.textContent = `Event ID: ${eventId || 'N/A'}`;
    this.modalEventId.value = eventId;
    this.regNameInput.value = '';
    this.regEmailInput.value = localStorage.getItem(STORAGE_KEY_LAST_EMAIL) || '';
    this.registerModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    setTimeout(() => {
      (this.regNameInput.value ? this.regEmailInput : this.regNameInput).focus();
    }, 100);
  }

  closeModal() {
    this.registerModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }

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

  async submitRegistration() {
    const eventId = this.modalEventId.value;
    const name = this.regNameInput.value.trim();
    const email = this.regEmailInput.value.trim();
    if (!eventId || !name || !email) return;

    this.closeModal();
    try {
      const result = await apiFetch('/register', {
        method: 'POST',
        body: JSON.stringify({
          eventId,
          providerId: this.selectedProviderId || undefined,
          sourceEventId: this.selectedSourceEventId || undefined,
          name,
          email,
        }),
      });
      const registration = result.registration || result;
      const regId = registration.registrationId || registration.id || 'OK';
      localStorage.setItem(STORAGE_KEY_LAST_EMAIL, email);
      this.searchEmailInput.value = email;
      this.showToast(`Registration confirmed. Ticket ${regId}`, 'success');
      this.fetchEvents();
      this.fetchRegistrations(email);
    } catch (err) {
      this.showToast(err.message || 'Registration failed', 'error');
    }
  }

  async fetchRegistrations(query = '') {
    const email = String(query || '').trim().toLowerCase();
    this.currentSearchEmail = email;
    this.regsLoading.classList.remove('hidden');
    this.regsList.classList.add('hidden');
    this.regsEmpty.classList.add('hidden');

    try {
      const path = email.includes('@')
        ? `/registrations/${encodeURIComponent(email)}`
        : '/registrations';
      const data = await apiFetch(path);
      this.allRegistrations = Array.isArray(data) ? data : (data.registrations || []);
      this.renderRegistrations(this.allRegistrations, email);
    } catch (err) {
      this.showToast(err.message || 'Could not look up registrations', 'error');
      this.allRegistrations = [];
      this.renderRegistrations([]);
    } finally {
      this.regsLoading.classList.add('hidden');
    }
  }

  renderRegistrations(regsList, defaultEmail = '') {
    this.regsList.innerHTML = '';
    if (!regsList || regsList.length === 0) {
      this.regsList.classList.add('hidden');
      this.regsEmpty.classList.remove('hidden');
      this.updateRegCount(0);
      return;
    }

    this.regsEmpty.classList.add('hidden');
    this.regsList.classList.remove('hidden');
    this.updateRegCount(regsList.length);

    const countEl = document.createElement('div');
    countEl.className = 'regs-count';
    countEl.textContent = `${regsList.length} registration${regsList.length !== 1 ? 's' : ''} found`;
    this.regsList.appendChild(countEl);

    regsList.forEach(reg => {
      const item = document.createElement('div');
      item.className = 'reg-item';
      const regId = String(reg.registrationId || reg.id || 'N/A');
      const eventId = String(reg.eventId || 'N/A');
      const foundEvt = this.events.find(e => e.eventId === eventId);
      const eventName = reg.eventName || (foundEvt && foundEvt.eventName) || `Event: ${eventId}`;
      const email = reg.email || defaultEmail || 'N/A';
      const nameStr = reg.name ? String(reg.name).trim() : '';
      const initials = nameStr
        ? nameStr.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
        : String(email)[0].toUpperCase();
      const dateVal = reg.createdAt || reg.registered_at || reg.timestamp;

      item.innerHTML = `
        <div class="reg-item-content">
          <div class="reg-avatar" aria-hidden="true">${this.escapeHtml(initials)}</div>
          <div class="reg-info">
            <h4>${this.escapeHtml(eventName)}</h4>
            <div class="reg-meta">
              <span><strong>${this.escapeHtml(nameStr || email)}</strong>${nameStr ? ` · ${this.escapeHtml(email)}` : ''}</span>
              <span>ID: <code>${this.escapeHtml(regId)}</code></span>
              ${dateVal ? `<span>${new Date(dateVal).toLocaleDateString()}</span>` : ''}
            </div>
          </div>
        </div>
        <button class="btn btn-danger btn-cancel-reg">Cancel</button>
      `;
      item.querySelector('.btn-cancel-reg').addEventListener('click', () => this.cancelRegistration(regId));
      this.regsList.appendChild(item);
    });
  }

  updateRegCount(count) {
    if (this.tabRegCount) this.tabRegCount.textContent = count > 0 ? count : '';
  }

  async cancelRegistration(registrationId) {
    const confirmed = await this.showConfirmDialog(
      `Cancel registration ${registrationId}? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await apiFetch(`/registration/${encodeURIComponent(registrationId)}`, { method: 'DELETE' });
      this.showToast('Registration cancelled', 'success');
      this.fetchEvents();
      this.fetchRegistrations(this.currentSearchEmail);
    } catch (err) {
      this.showToast(err.message || 'Failed to cancel', 'error');
    }
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `${type === 'success' ? ICONS.check : ICONS.error}<span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px) scale(0.96)';
      setTimeout(() => toast.remove(), 250);
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

document.addEventListener('DOMContentLoaded', () => {
  window.app = new EventPulseApp();
});
