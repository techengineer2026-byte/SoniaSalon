/**
 * SONIA'S SALON & SPA - FRONTEND BOOKING LOGIC (FULL FIX)
 * Fixes: Timezone issues, proper staff handling, availability fetch
 */

// ==================== CONFIGURATION ====================
const API_URL = "https://script.google.com/macros/s/AKfycbw-9qyDyPCKDBpsYxoFyhcH5vrArNdU-oM99VMfIGc6ey7BBrQ94UL1gJbRoT4IOwxnmQ/exec";
const DEPOSIT_THRESHOLD = 200;

// ==================== GLOBAL STATE ====================
let allServices = [];
let allStaff = [];
let cart = [];
let selectedDate = null;
let selectedTime = null;
let currentStep = 1;
let availableSlots = [];
let stripeInitialized = false;
let isFetchingSlots = false;
let isSubmittingBooking = false;
let availabilityCache = {};

// ==================== INITIALIZATION ====================
async function init() {
    try {
        showLoader(true);

        const res = await fetch(API_URL);
        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load data');
        }

        allServices = data.services || [];
        allStaff = data.staff || [];

        console.log('✓ Loaded services:', allServices.length);
        console.log('✓ Loaded staff:', allStaff.length);

        renderCategories();
        renderServices("Nails");
        generateCalendar();

        setTimeout(() => {
            showLoader(false);
        }, 1000);

    } catch (error) {
        console.error("❌ Initialization Error:", error);
        showLoader(false);
        showErrorNotification('Failed to load booking system. Please refresh the page.');
    }
}

function showLoader(show) {
    const loader = document.getElementById('luxuryLoader');
    if (loader) {
        if (show) {
            loader.classList.remove('hidden');
        } else {
            loader.classList.add('hidden');
        }
    }
}

// ==================== CATEGORIES ====================
function renderCategories() {
    const cats = [...new Set(allServices.map(s => s.category))].filter(c => c);
    const nav = document.getElementById('categoryNav');
    if (!nav) return;

    nav.innerHTML = cats.map((c, i) => `
                <button class="cat-btn ${i === 0 ? 'active' : ''}" onclick="filterCategory('${escapeHtml(c)}', this)">
                    ${escapeHtml(c)}
                </button>
            `).join('');
}

function filterCategory(cat, btn) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderServices(cat);
}

// ==================== SERVICES ====================
function renderServices(cat) {
    const list = document.getElementById('servicesList');
    if (!list) return;

    const filtered = allServices.filter(s => s.category === cat);

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-summary"><i class="bi bi-info-circle"></i><p>No services available in this category</p></div>';
        return;
    }

    list.innerHTML = filtered.map(s => {
        const isSelected = cart.some(i => i.name === s.name);
        const enc = encodeURIComponent(s.name);
        const encCat = encodeURIComponent(s.category);
        const safeDesc = escapeHtml(s.description || '');
        const duration = parseDurationToMinutes(s.duration);

        return `
                <div class="service-card ${isSelected ? 'selected' : ''}" 
                    onclick="selectServiceAndShowStaff('${enc}', ${parseFloat(s.price)}, ${duration}, '${encCat}')">
                    
                    <div class="service-info">
                        <div class="service-name">${escapeHtml(s.name)}</div>
                        ${safeDesc ? `<p class="service-description">${safeDesc}</p>` : ''}
                        
                        <div class="service-meta-tags">
                            <span><i class="bi bi-clock"></i> ${formatDuration(duration)}</span>
                        </div>
                    </div>

                    <div class="service-action">
                        <span class="service-price">CA$${parseFloat(s.price).toFixed(2)}</span>
                        <div class="add-service-btn">
                            <i class="bi ${isSelected ? 'bi-check-circle-fill' : 'bi-plus-circle'}"></i>
                        </div>
                    </div>
                </div>`;
    }).join('');
}
function updateMobileDrawer() {
    const summary = document.getElementById('summaryItems');
    const drawer = document.getElementById('drawerItems');

    if (!summary || !drawer) return;

    drawer.innerHTML = summary.innerHTML;

    // Sync totals
    const subtotal = cart.reduce((s, i) => s + parseFloat(i.price), 0);
    const gst = subtotal * 0.05;
    const total = subtotal + gst;
    const totalDur = cart.reduce((s, i) => s + parseInt(i.duration || 0), 0);

    updateEl('drawerSubtotal', `CA$${subtotal.toFixed(2)}`);
    updateEl('drawerGst', `CA$${gst.toFixed(2)}`);
    updateEl('drawerTotal', `CA$${total.toFixed(2)}`);
    updateEl('drawerDuration', `<i class="bi bi-clock"></i> ${formatDuration(totalDur)}`);
}

// ==================== STAFF SELECTION MODAL ====================
function selectServiceAndShowStaff(enc, price, duration, encCategory) {
    const name = decodeURIComponent(enc);
    const category = decodeURIComponent(encCategory);

    const idx = cart.findIndex(i => i.name === name);
    if (idx > -1) {
        cart.splice(idx, 1);
        availabilityCache = {};  // cart changed — invalidate cached slots
        updateCartUI();
        renderServices(category);
        return;
    }

    showStaffPickerModal(name, price, duration, category);
}
function showStaffPickerModal(serviceName, price, duration, category) {
    const eligible = allStaff.filter(s => canStaffHandle(s.expertise, serviceName));

    const modal = document.getElementById('staffPickerModal');
    const title = document.getElementById('staffPickerTitle');
    const container = document.getElementById('staffPickerContainer');

    if (!modal || !title || !container) {
        console.error('Staff picker modal elements not found');
        return;
    }

    title.textContent = serviceName;

    container.innerHTML = `
                <div class="slux-any selected" 
                    onclick="confirmStaffSelection('${encodeURIComponent(serviceName)}', ${price}, ${duration}, '${encodeURIComponent(category)}', '', this)">
                    <div class="slux-check">
                        <svg viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="1.5">
                            <polyline points="1.5,5 4,7.5 8.5,2.5"/>
                        </svg>
                    </div>
                    <div class="slux-any-icon"><i class="bi bi-people"></i></div>
                    <div>
                        <div class="slux-name">Any Available Specialist</div>
                        <div class="slux-role">We'll assign the best match for you</div>
                    </div>
                </div>
                
                <div class="slux-grid mt-3">
                    ${eligible.map(s => {
        const initials = s.name ? s.name.slice(0, 2).toUpperCase() : 'NA';
        const isOwner = s.expertise?.toLowerCase().includes('owner');
        const tags = parseStaffTags(s.expertise);
        const avatarUrl = s.avatarurl || s.avatar || '';

        return `
                        <div class="staff-card-lux" 
                            data-service-name="${encodeURIComponent(serviceName)}"
                            data-price="${price}"
                            data-duration="${duration}"
                            data-category="${encodeURIComponent(category)}"
                            data-staff-name="${escapeHtml(s.name)}"
                            onclick="confirmStaffSelectionFromCard(this)">
                            <div class="slux-check">
                                <svg viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="1.5">
                                    <polyline points="1.5,5 4,7.5 8.5,2.5"/>
                                </svg>
                            </div>
                            <div class="slux-avatar-wrap">
                                ${avatarUrl
                ? `<img class="slux-avatar" src="${avatarUrl}" alt="${escapeHtml(s.name)}"
                                        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : ''}
                                <div class="slux-avatar-fallback" style="${avatarUrl ? 'display:none' : ''}">
                                    ${initials}
                                </div>
                                ${isOwner ? `<div class="slux-owner-badge">OWNER</div>` : ''}
                            </div>
                            <div class="slux-name">${escapeHtml(s.name)}</div>
                            <div class="slux-role">${parseStaffRole(s.expertise)}</div>
                            <div class="slux-tags">
                                ${tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}
                            </div>
                        </div>`;
    }).join('')}
                </div>
            `;

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function confirmStaffSelectionFromCard(el) {
    const serviceName = decodeURIComponent(el.getAttribute('data-service-name'));
    const price = parseFloat(el.getAttribute('data-price'));
    const duration = parseInt(el.getAttribute('data-duration'));
    const category = decodeURIComponent(el.getAttribute('data-category'));
    const staffName = el.getAttribute('data-staff-name');

    console.log('✓ Staff selected:', staffName, 'for service:', serviceName);

    confirmStaffSelection(
        encodeURIComponent(serviceName),
        price,
        duration,
        encodeURIComponent(category),
        staffName,
        el
    );
}

function confirmStaffSelection(encName, price, duration, encCategory, staffName, el) {
    const container = el.closest('#staffPickerContainer');
    if (container) {
        container.querySelectorAll('.staff-card-lux, .slux-any')
            .forEach(c => c.classList.remove('selected'));
    }
    el.classList.add('selected');

    const name = decodeURIComponent(encName);
    const category = decodeURIComponent(encCategory);

    cart.push({
        name: name,
        price: parseFloat(price),
        duration: parseInt(duration),
        staff: staffName || null,
        category: category
    });
    availabilityCache = {};  // cart changed — invalidate cached slots
    console.log('✓ Service added to cart:', {
        name: name,
        staff: staffName || 'Any Available',
        price: price,
        duration: duration
    });

    setTimeout(() => {
        closeStaffPickerModal();
        updateCartUI();
        renderServices(category);
        // Re-fetch with updated cart
        if (selectedDate) {
            availabilityCache = {};
            fetchAvailableSlots(selectedDate);
        }
    }, 400);
}

function closeStaffPickerModal() {
    const modal = document.getElementById('staffPickerModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

function parseStaffRole(expertise) {
    if (!expertise) return 'Specialist';
    const first = expertise.split('•')[0].trim();
    return first.length > 30 ? first.slice(0, 28) + '…' : first;
}

function parseStaffTags(expertise) {
    if (!expertise) return [];
    return expertise.split('•')
        .slice(1, 4)
        .map(t => t.trim())
        .filter(t => t.length > 0 && t.length < 22);
}

function canStaffHandle(expertise, serviceName) {
    if (!expertise) return false;

    const exp = expertise.toLowerCase();

    if (exp.includes('all services') || exp.includes('owner')) {
        return true;
    }

    const srv = allServices.find(s => s.name === serviceName);
    if (!srv) return false;

    const cat = srv.category.toLowerCase();
    const catSingular = cat.replace(/s$/, '');
    const srvLower = serviceName.toLowerCase();

    return exp.includes(cat) ||
        exp.includes(catSingular) ||
        exp.includes(srvLower);
}

function generateCalendar() {
    // ── Set selectedDate FIRST before anything else ──
    if (!selectedDate) {
        const today = new Date();
        selectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    const cal = document.getElementById('calendarDays');
    if (!cal) return;

    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
        'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let html = '';

    for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        html += `
            <div class="calendar-day ${i === 0 ? 'selected' : ''}"
                onclick="selectDate('${isoDate}', this)">
                <span class="day-name">${days[d.getDay()]}</span>
                <span class="day-number">${d.getDate()}</span>
                <span class="day-month">${months[d.getMonth()]}</span>
            </div>`;
    }

    cal.innerHTML = html;

    // ── Update date display ──
    const displayEl = document.getElementById('selectedDateDisplay');
    if (displayEl) {
        displayEl.textContent = new Date(selectedDate + 'T12:00:00')
            .toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric',
                month: 'long', day: 'numeric'
            });
    }

    // ── DECLARE timeSlotsGrid BEFORE using it ──
    const timeSlotsGrid = document.getElementById('timeSlots');

    // REPLACE WITH:
    if (timeSlotsGrid) {
        timeSlotsGrid.innerHTML = `
<div class="slots-loading-premium">
    <div class="slots-loading-label">
        <div class="loading-spinner-dot"></div>
        <span id="loadingStatusText">Checking availability...</span>
    </div>
    <div class="skeleton-group">
        <div class="skeleton-group-title"></div>
        <div class="skeleton-row">
            <div class="slot-skeleton"></div>
            <div class="slot-skeleton"></div>
            <div class="slot-skeleton delay-1"></div>
            <div class="slot-skeleton delay-2"></div>
        </div>
    </div>
    <div class="skeleton-group">
        <div class="skeleton-group-title"></div>
        <div class="skeleton-row">
            <div class="slot-skeleton delay-1"></div>
            <div class="slot-skeleton delay-2"></div>
            <div class="slot-skeleton delay-3"></div>
            <div class="slot-skeleton"></div>
            <div class="slot-skeleton delay-1"></div>
            <div class="slot-skeleton delay-2"></div>
        </div>
    </div>
    <div class="skeleton-group">
        <div class="skeleton-group-title"></div>
        <div class="skeleton-row">
            <div class="slot-skeleton delay-2"></div>
            <div class="slot-skeleton delay-3"></div>
            <div class="slot-skeleton"></div>
        </div>
    </div>
</div>`;
        startLoadingMessages();
    }
    fetchAvailableSlots(selectedDate);
}
// ==================== FIX: Only fetch when user clicks date ====================
async function selectDate(ds, el) {
    selectedDate = ds;

    selectedTime = null;

    document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
    el.classList.add('selected');

    const displayEl = document.getElementById('selectedDateDisplay');
    if (displayEl) {
        displayEl.textContent = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    const timeSlotsGrid = document.getElementById('timeSlots');
    if (timeSlotsGrid) {
        timeSlotsGrid.innerHTML = `
<div class="slots-loading-premium">
    <div class="slots-loading-label">
        <div class="loading-spinner-dot"></div>
        <span id="loadingStatusText">Checking availability...</span>
    </div>
    <div class="skeleton-group">
        <div class="skeleton-group-title"></div>
        <div class="skeleton-row">
            <div class="slot-skeleton"></div>
            <div class="slot-skeleton"></div>
            <div class="slot-skeleton delay-1"></div>
            <div class="slot-skeleton delay-2"></div>
        </div>
    </div>
    <div class="skeleton-group">
        <div class="skeleton-group-title"></div>
        <div class="skeleton-row">
            <div class="slot-skeleton delay-1"></div>
            <div class="slot-skeleton delay-2"></div>
            <div class="slot-skeleton delay-3"></div>
            <div class="slot-skeleton"></div>
            <div class="slot-skeleton delay-1"></div>
            <div class="slot-skeleton delay-2"></div>
        </div>
    </div>
    <div class="skeleton-group">
        <div class="skeleton-group-title"></div>
        <div class="skeleton-row">
            <div class="slot-skeleton delay-2"></div>
            <div class="slot-skeleton delay-3"></div>
            <div class="slot-skeleton"></div>
        </div>
    </div>
</div>`;
        startLoadingMessages();
    }

    // Wait for any in-progress fetch to finish, then fetch fresh
    if (isFetchingSlots) {
        const waitAndFetch = setInterval(() => {
            if (!isFetchingSlots) {
                clearInterval(waitAndFetch);
                fetchAvailableSlots(selectedDate);
                updateActionButtons();
            }
        }, 200);
        return;
    }
    console.log('👤 Services in cart:', cart.length);
    cart.forEach((item, i) => {
        console.log(`  [${i}] ${item.name} - Staff: ${item.staff || 'Any Available'}`);
    });

    await fetchAvailableSlots(selectedDate);
    updateActionButtons();
}
let loadingMessageTimer = null;
function startLoadingMessages() {
    const messages = [
        { time: 0, text: 'Checking availability...' },
        { time: 2000, text: 'Syncing with calendar...' },
        { time: 4000, text: 'Almost there...' },
        { time: 7000, text: 'Taking a little longer than usual...' },
        { time: 11000, text: 'Still working on it — thanks for your patience 🙏' },
    ];

    // Clear any previous timer
    if (loadingMessageTimer) {
        loadingMessageTimer.forEach(t => clearTimeout(t));
    }
    loadingMessageTimer = [];

    messages.forEach(({ time, text }) => {
        const t = setTimeout(() => {
            const el = document.getElementById('loadingStatusText');
            if (el) el.textContent = text;
        }, time);
        loadingMessageTimer.push(t);
    });
}

function stopLoadingMessages() {
    if (loadingMessageTimer) {
        loadingMessageTimer.forEach(t => clearTimeout(t));
        loadingMessageTimer = [];
    }
}

// ==================== FIX: Proper staff parameter handling ====================
async function fetchAvailableSlots(dateString) {
    if (isFetchingSlots) return;

    // Don't fetch if cart is empty
    if (cart.length === 0) {
        const grid = document.getElementById('timeSlots');
        if (grid) {
            grid.innerHTML = `
                <div class="no-availability-box">
                    <i class="bi bi-bag"></i>
                    <p>Select a service first to see available times.</p>
                </div>`;
        }
        return;
    }

    isFetchingSlots = true;

    const timeSlotsGrid = document.getElementById('timeSlots');

    try {
        const totalDuration = cart.reduce((sum, item) => sum + parseInt(item.duration || 0), 0);
        const specificStaff = [...new Set(
            cart.map(item => item.staff)
                .filter(s => s && s.trim() !== '' && s !== 'Any Available')
        )];
        const hasAnyAvailable = cart.some(
            item => !item.staff || item.staff.trim() === '' || item.staff === 'Any Available'
        );

        const cacheKey = `${dateString}_${specificStaff.sort().join('_')}_any${hasAnyAvailable}_${totalDuration}`;
        if (availabilityCache[cacheKey]) {
            console.log('Using cached availability');
            availableSlots = availabilityCache[cacheKey].available;
            renderTimeSlots(availabilityCache[cacheKey].allSlots);
            isFetchingSlots = false;
            return;
        }

        // ── ONE single fetch instead of 3-4 ──
        const url = `${API_URL}?action=getAllAvailability&date=${encodeURIComponent(dateString)}&duration=${totalDuration}`;
        console.log('Fetching all staff availability in one call:', url);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`API error ${response.status}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to fetch availability');

        const staffAvailability = data.staffAvailability || {};

        let slots = [];
        let allSlots = [];

        if (specificStaff.length === 0 && hasAnyAvailable) {
            // Any Available — union of all staff slots
            const allAvailable = new Set();
            const allManual = new Set();
            Object.values(staffAvailability).forEach(s => {
                s.available.forEach(t => allAvailable.add(t));
                s.manual.forEach(t => allManual.add(t));
            });
            slots = Array.from(allAvailable);
            allSlots = Array.from(allManual);

        } else if (specificStaff.length > 0) {
            // Named staff — intersect their available slots
            const staffResults = specificStaff
                .map(name => staffAvailability[name]?.available || []);
            slots = staffResults.length > 0
                ? staffResults.reduce((intersection, staffSlots) =>
                    intersection.filter(slot => staffSlots.includes(slot)))
                : [];
            // Manual slots for booked display
            const manualResults = specificStaff
                .map(name => staffAvailability[name]?.manual || []);
            allSlots = [...new Set(manualResults.flat())];
        }

        availableSlots = slots;
        availabilityCache[cacheKey] = { available: slots, allSlots };

        console.log(`Found ${availableSlots.length} available slots`);
        renderTimeSlots(allSlots);

    } catch (error) {
        console.error('Error fetching availability:', error);
        if (timeSlotsGrid) {
            timeSlotsGrid.innerHTML = `
            <div class="slots-error-box">
                <div class="slots-error-icon">😕</div>
                <strong>Couldn't load available times</strong>
                <p>This sometimes happens with slow connections. Please try again.</p>
                <button class="retry-btn" onclick="retryFetchSlots()">
                    <i class="bi bi-arrow-clockwise"></i> Try Again
                </button>
                <div class="slots-error-call">
                    Or call us directly — we'll book you in 2 minutes<br>
                    <a href="tel:4319771222"><strong>(431) 977-1222</strong></a>
                </div>
            </div>`;
        }
        availableSlots = [];
    } finally {
        isFetchingSlots = false;
        stopLoadingMessages();

    }
}

function renderTimeSlots(allSlots = []) {
    const grid = document.getElementById('timeSlots');
    if (!grid) return;

    const bookedSlots = allSlots.filter(s => !availableSlots.includes(s));

    const displaySlots = [
        ...availableSlots.map(s => ({ time: s, status: 'available' })),
        ...bookedSlots.map(s => ({ time: s, status: 'booked' }))
    ].sort((a, b) => parseTime(a.time) - parseTime(b.time));

    if (displaySlots.length === 0) {
        grid.innerHTML = `
            <div class="no-availability-box">
                <i class="bi bi-calendar-x"></i>
                <p>No available slots found.</p>
                <small>Please try a different date or call us at (431) 977-1222</small>
            </div>`;
        return;
    }

    const morning = [], afternoon = [], evening = [];
    displaySlots.forEach(slot => {
        const timeValue = parseTime(slot.time);
        if (timeValue < 720) morning.push(slot);
        else if (timeValue < 1020) afternoon.push(slot);
        else evening.push(slot);
    });

    grid.innerHTML = `
        ${renderTimeGroup('Morning', morning)}
        ${renderTimeGroup('Afternoon', afternoon)}
        ${renderTimeGroup('Evening', evening)}
    `;
}

function renderTimeGroup(title, slots) {
    return `
        <div class="time-group">
            <h5 class="time-group-title">${title}</h5>
            <div class="time-slots-subgrid">
                ${slots.length > 0
            ? slots.map(s => {
                if (s.status === 'booked') {
                    return `
                                <button class="time-slot booked" disabled title="Already booked">
                                    ${s.time}
                                    <small style="display:block;font-size:0.6rem;font-weight:700;letter-spacing:0.5px;margin-top:2px;opacity:0.7;">BOOKED</small>
                                </button>`;
                }
                // BUG: selectedTime === s.time but s is an object {time, status}
                return `<button class="time-slot ${selectedTime === s.time ? 'selected' : ''}"
                    onclick="selectTime('${s.time}', this)">${s.time}</button>`;
            }).join('')
            : `<p class="no-slots-text">No availability</p>`
        }
            </div>
        </div>
    `;
}
function parseTime(timeStr) {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
}
function retryFetchSlots() {
    const timeSlotsGrid = document.getElementById('timeSlots');
    if (timeSlotsGrid) {
        timeSlotsGrid.innerHTML = `
        <div class="slots-loading-premium">
            <div class="slots-loading-label">
                <div class="loading-spinner-dot"></div>
                <span id="loadingStatusText">Retrying...</span>
            </div>
            <div class="skeleton-group">
                <div class="skeleton-group-title"></div>
                <div class="skeleton-row">
                    <div class="slot-skeleton"></div>
                    <div class="slot-skeleton delay-1"></div>
                    <div class="slot-skeleton delay-2"></div>
                    <div class="slot-skeleton delay-3"></div>
                </div>
            </div>
        </div>`;
        startLoadingMessages();
    }
    if (selectedDate) fetchAvailableSlots(selectedDate);
}
function selectTime(t, el) {
    selectedTime = t;
    document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    updateActionButtons();
}

// ==================== CHECKOUT SUMMARY (STEP 3) ====================
function renderStep3Summary() {
    const container = document.getElementById('appointmentSummaryItems');
    const dateEl = document.getElementById('appointmentSummaryDate');
    const timeEl = document.getElementById('appointmentSummaryTime');
    const deadlineEl = document.getElementById('cancelDeadline');

    if (dateEl && selectedDate) {
        const d = new Date(selectedDate + 'T12:00:00');
        dateEl.textContent = d.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    if (timeEl && selectedTime) {
        timeEl.textContent = `${selectedTime} (Estimated)`;
    }

    if (deadlineEl && selectedDate && selectedTime) {
        // Parse the actual appointment time to compute a precise 24-hour deadline
        const [timePart, modifier] = selectedTime.split(' ');
        let [hours, minutes] = timePart.split(':').map(Number);
        if (modifier === 'PM' && hours !== 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;

        const apptDateTime = new Date(selectedDate + 'T12:00:00');
        apptDateTime.setHours(hours, minutes, 0, 0);

        const deadline = new Date(apptDateTime.getTime() - 24 * 60 * 60 * 1000);

        deadlineEl.textContent = deadline.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric'
        }) + ', ' + deadline.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }
    if (container) {
        container.innerHTML = cart.map(item => `
                    <div class="summary-line">
                        <div class="d-flex justify-content-between">
                            <strong>${escapeHtml(item.name)}</strong>
                            <span>CA$${parseFloat(item.price).toFixed(2)}</span>
                        </div>
                        <small class="text-muted">with ${escapeHtml(item.staff || 'Any Available')}</small>
                    </div>
                `).join('');
    }
    const subtotal = cart.reduce((s, i) => s + parseFloat(i.price), 0);

    const gst = subtotal * 0.05;
    const total = subtotal + gst;
    updateEl('step3Subtotal', `CA$${subtotal.toFixed(2)}`);
    updateEl('step3GST', `CA$${gst.toFixed(2)}`);
    updateEl('step3Total', `CA$${total.toFixed(2)}`);
    updateEl('step3DueAtAppt', `CA$${total.toFixed(2)}`);
    checkPaymentRequirement(total);
}

function checkPaymentRequirement(total) {
    const paymentSection = document.getElementById('paymentSection');

    if (total >= DEPOSIT_THRESHOLD) {
        if (paymentSection) {
            paymentSection.style.display = 'block';

            if (!stripeInitialized && typeof Stripe !== 'undefined') {
                initializeStripe();
            }
        }
    } else {
        if (paymentSection) {
            paymentSection.style.display = 'none';
        }
    }
}

// ==================== CART UI ====================
function updateCartUI() {
    const subtotal = cart.reduce((s, i) => s + parseFloat(i.price), 0);

    const gst = subtotal * 0.05;
    const total = subtotal + gst;
    const totalDur = cart.reduce((s, i) => s + parseInt(i.duration), 0);

    const fmt = v => `CA$${v.toFixed(2)}`;

    updateEl('subtotal', fmt(subtotal));
    updateEl('gst', fmt(gst));
    updateEl('total', fmt(total));
    updateEl('durationBadge', `<i class="bi bi-clock"></i> ${formatDuration(totalDur)}`);
    updateEl('mobileTotal', fmt(total));
    updateEl('mobileCount', `${cart.length} service${cart.length !== 1 ? 's' : ''} • ${formatDuration(totalDur)}`);

    const items = document.getElementById('summaryItems');
    if (items) {
        if (cart.length === 0) {
            items.innerHTML = `
                        <div class="empty-summary">
                            <i class="bi bi-bag"></i>
                            <p>No services selected</p>
                        </div>
                    `;
        } else {
            items.innerHTML = cart.map(i => `
                        <div class="summary-item">
                            <div class="item-details">
                                <h4>${escapeHtml(i.name)}</h4>
                                <p>${formatDuration(i.duration)}</p>
                                <small class="text-muted">with ${escapeHtml(i.staff || 'Any Specialist')}</small>
                            </div>
                            <div class="item-price">CA$${parseFloat(i.price).toFixed(2)}</div>
                        </div>
                    `).join('');
        }
    }

    updateActionButtons();
    updateMobileDrawer();

}

function updateActionButtons() {
    const p = document.getElementById('primaryActionBtn');
    const m = document.getElementById('mobileActionBtn');
    const s3 = document.getElementById('step3BookBtn');

    let enabled = false;
    let text = 'Continue';

    if (currentStep === 1) {
        enabled = cart.length > 0;
        text = 'Continue to Date & Time';
    }
    else if (currentStep === 2) {
        enabled = selectedDate && selectedTime;
        text = 'Continue to Details';
    }
    else if (currentStep === 3) {
        enabled = validateForm();
        text = 'Book Appointment';
    }

    if (p) {
        p.disabled = !enabled;
        p.textContent = text;
    }
    if (m) {
        m.disabled = !enabled;
        m.textContent = text.replace('Continue to ', '');
    }
    if (s3) {
        s3.disabled = !enabled;
    }
}

// ==================== NAVIGATION ====================
function goToStep(n) {
    currentStep = n;
    // Hide sidebar + mobile bar on step 3
    const primaryBtn = document.getElementById('primaryActionBtn');
    if (primaryBtn) primaryBtn.style.display = n === 3 ? 'none' : 'block';

    const mobileBar = document.querySelector('.mobile-bottom-bar');
    if (mobileBar) mobileBar.style.display = n === 3 ? 'none' : 'flex';


    document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
    const targetStep = document.getElementById(`step${n}`);
    if (targetStep) {
        targetStep.classList.add('active');
    }

    updateEl('currentStep', String(n));

    document.querySelectorAll('.step-dots .dot').forEach((d, i) => {
        d.classList.toggle('active', i < n);
    });

    // REPLACE WITH:
    if (n === 2) {
        generateCalendar();  // this already calls fetchAvailableSlots for today
    }
    if (n === 3) {
        renderStep3Summary();
    }

    updateActionButtons();

    const scrollStage = document.querySelector('.scroll-stage');
    if (scrollStage) {
        scrollStage.scrollTo(0, 0);
    }
}

function handleMainAction() {
    if (currentStep < 3) {
        goToStep(currentStep + 1);
    } else {
        submitBooking();
    }
}

function validateForm() {
    const form = document.getElementById('contactForm');
    if (!form) return false;

    const inputs = form.querySelectorAll('input[required]');
    return Array.from(inputs).every(i => i.value.trim() !== '');
}

// ==================== STRIPE PAYMENT INTEGRATION ====================
let stripe, cardElement;

function initializeStripe() {
    try {
        const STRIPE_PUBLIC_KEY = 'pk_test_YOUR_KEY_HERE';

        if (!window.Stripe) {
            console.error('Stripe.js not loaded');
            return;
        }

        stripe = Stripe(STRIPE_PUBLIC_KEY);
        const elements = stripe.elements();

        cardElement = elements.create('card', {
            style: {
                base: {
                    fontSize: '16px',
                    color: '#2c2c2c',
                    fontFamily: '"Montserrat", sans-serif',
                    '::placeholder': {
                        color: '#aaa'
                    }
                },
                invalid: {
                    color: '#e74c3c',
                    iconColor: '#e74c3c'
                }
            }
        });

        const cardElementContainer = document.getElementById('card-element');
        if (cardElementContainer) {
            cardElement.mount('#card-element');

            cardElement.on('change', function (event) {
                const displayError = document.getElementById('card-errors');
                if (event.error) {
                    displayError.textContent = event.error.message;
                } else {
                    displayError.textContent = '';
                }
            });
        }

        stripeInitialized = true;
        console.log('✓ Stripe initialized successfully');

    } catch (error) {
        console.error('❌ Error initializing Stripe:', error);
    }
}

async function getPaymentToken() {
    if (!stripe || !cardElement) {
        return null;
    }

    try {
        const { token, error } = await stripe.createToken(cardElement);

        if (error) {
            const displayError = document.getElementById('card-errors');
            if (displayError) {
                displayError.textContent = error.message;
            }
            return null;
        }

        return {
            cardToken: token.id,
            cardLast4: token.card.last4,
            cardBrand: token.card.brand
        };

    } catch (error) {
        console.error('❌ Error creating payment token:', error);
        return null;
    }
}

// ==================== BOOKING SUBMISSION ====================

async function submitBooking() {
    const btn = document.getElementById('step3BookBtn');
    if (!btn) return;

    btn.disabled = true;
    if (isSubmittingBooking) return;
    isSubmittingBooking = true;
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';

    try {
        const form = document.getElementById('contactForm');
        const fd = new FormData(form);

        const subtotal = cart.reduce((s, i) => s + parseFloat(i.price), 0);
        const gst = subtotal * 0.05;
        const total = subtotal + gst;
        const totalDuration = cart.reduce((s, i) => s + parseInt(i.duration), 0);

        let paymentInfo = null;
        if (total >= DEPOSIT_THRESHOLD) {
            paymentInfo = await getPaymentToken();
            if (!paymentInfo) {
                throw new Error('Payment authorization required for bookings over CA$' + DEPOSIT_THRESHOLD);
            }
        }

        const payload = {
            date: selectedDate,
            time: selectedTime,
            staff: getMainStaff(),
            services: cart.map(i => `${i.name} (with ${i.staff || 'Any'})`).join(', '),
            total: `CA$${total.toFixed(2)}`,
            totalDuration: totalDuration,
            name: `${fd.get('firstName')} ${fd.get('lastName')}`,
            email: fd.get('email'),
            phone: fd.get('phone').replace(/\D/g, ''),
            cardToken: paymentInfo?.cardToken || '',
            cardLast4: paymentInfo?.cardLast4 || '',
            cardBrand: paymentInfo?.cardBrand || ''
        };

        console.log('📤 Submitting booking:', payload);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('📥 Booking response:', result);

        if (result.status === 'success') {
            // ✅ DISABLE THE BOOKED TIME SLOT

            // 💾 OPTIONAL: Save to localStorage for persistence

            availabilityCache = {};
            showSuccessModal({
                bookingId: result.bookingId,
                email: payload.email,
                date: selectedDate,
                time: selectedTime,
                services: payload.services,
                clientType: result.clientType
            });
        } else if (result.conflict) {
            showErrorNotification('This time slot is no longer available. Please select a different time.');
            goToStep(2);
        } else {
            throw new Error(result.message || 'Booking failed');
        }

    } catch (error) {
        console.error('❌ Booking submission error:', error);
        showErrorNotification(error.message || 'Something went wrong. Please try again.');
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.textContent = 'Book Appointment';
    } finally {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        isSubmittingBooking = false;
    }
}
function disableTimeSlot(timeSlot) {
    if (!timeSlot) return;

    const timeSlots = document.querySelectorAll('.time-slot');

    timeSlots.forEach(slot => {
        const slotText = slot.textContent.trim();

        if (slotText === timeSlot) {
            // Mark as disabled
            slot.disabled = true;
            slot.classList.add('disabled');

            // Apply blur/visual disabled state
            slot.style.opacity = '0.4';
            slot.style.pointerEvents = 'none';
            slot.style.cursor = 'not-allowed';
            slot.style.filter = 'blur(0.5px)';
            slot.style.background = 'var(--gray-200)';
            slot.style.color = 'var(--gray-400)';

            // Add a small icon or text to indicate booked
            const bookedLabel = document.createElement('small');
            bookedLabel.className = 'booked-label';
            bookedLabel.textContent = 'BOOKED';
            bookedLabel.style.display = 'block';
            bookedLabel.style.fontSize = '0.65rem';
            bookedLabel.style.marginTop = '2px';
            bookedLabel.style.fontWeight = '700';
            bookedLabel.style.letterSpacing = '0.5px';

            slot.appendChild(bookedLabel);

            console.log('✓ Time slot disabled:', timeSlot);
        }
    });
}


// ==================== ALTERNATIVE: PERSIST DISABLED SLOTS ====================
// If you want to keep disabled slots across page refreshes, use localStorage:


function getMainStaff() {
    if (cart.length === 0) return 'Any Available';

    const staffCounts = {};
    cart.forEach(item => {
        const staff = item.staff || 'Any Available';
        staffCounts[staff] = (staffCounts[staff] || 0) + 1;
    });

    return Object.keys(staffCounts).reduce((a, b) =>
        staffCounts[a] > staffCounts[b] ? a : b
    );
}

// ==================== MODALS ====================
function showSuccessModal(data) {
    const m = document.getElementById('successModal');
    if (!m) return;

    updateEl('confirmEmail', data.email);

    if (data.date) {
        const d = new Date(data.date + 'T12:00:00');
        updateEl('confirmDate', d.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }));

    }

    updateEl('confirmTime', data.time || '');
    updateEl('confirmServices', data.services || '');

    m.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSuccessModal() {
    window.location.href = '/';
}

function showErrorNotification(message) {
    const div = document.createElement('div');
    div.className = 'booking-error-toast';
    div.innerHTML = `
        <i class="bi bi-exclamation-circle"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(div);

    setTimeout(() => {
        div.classList.add('show');
    }, 10);

    setTimeout(() => {
        div.classList.remove('show');

        setTimeout(() => {
            div.remove();
        }, 300);

    }, 4000);
}

// ==================== UTILITY FUNCTIONS ====================
function updateEl(id, val) {
    const el = document.getElementById(id);
    if (!el) return;

    if (typeof val === 'string' && val.includes('<')) {
        el.innerHTML = val;
    } else {
        el.textContent = val;
    }
}

function formatDuration(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;

    if (h > 0 && m > 0) {
        return `${h} hr ${m} min`;
    } else if (h > 0) {
        return `${h} hr`;
    } else {
        return `${m} min`;
    }
}

function parseDurationToMinutes(dur) {
    if (!dur) return 0;

    const str = String(dur).toLowerCase().trim();

    // Already a plain number (e.g. "45" meaning 45 minutes)
    if (/^\d+$/.test(str)) return parseInt(str);

    let mins = 0;

    // Match hours: "1h", "1 hr", "1 hour", "1 hours"
    const hrs = str.match(/(\d+)\s*h(?:r|rs|our|ours)?/);
    if (hrs) mins += parseInt(hrs[1]) * 60;

    // Match minutes: "30m", "30 min", "30 mins", "30 minute", "30 minutes"
    // Use word boundary to avoid matching the 'm' in '1h30m' twice
    const ms = str.match(/(\d+)\s*m(?:in|ins|inute|inutes)?(?!\s*h)/);
    if (ms) mins += parseInt(ms[1]);

    return mins || 0;
}

function escapeHtml(str) {
    if (!str) return '';

    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function toggleMobileDrawer() {
    const drawer = document.getElementById('mobileDrawer');
    const backdrop = document.getElementById('mobileDrawerBackdrop');
    if (drawer) {
        drawer.classList.toggle('open');
    }
    if (backdrop) {
        backdrop.classList.toggle('open');
    }
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Booking system initializing...');
    init();

    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('input', updateActionButtons);
    }

    const phoneInput = document.querySelector('input[name="phone"]');
    if (phoneInput) {
        phoneInput.addEventListener('input', function (e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 0) {
                if (value.length <= 3) {
                    value = `(${value}`;
                } else if (value.length <= 6) {
                    value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
                } else {
                    value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
                }
            }
            e.target.value = value;
        });
    }
});

window.addEventListener('popstate', function (e) {
    if (currentStep > 1) {
        goToStep(currentStep - 1);
    }
});

window.addEventListener('beforeunload', function (e) {
    if (cart.length > 0 && currentStep > 1) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});

console.log('✓ Booking logic loaded successfully');




