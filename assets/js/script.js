const menuBtn = document.getElementById('menuBtn');
const mobileOverlay = document.getElementById('mobileOverlay');

menuBtn.addEventListener('click', () => {
    menuBtn.classList.toggle('active');

    mobileOverlay.classList.toggle('is-open');

    if (mobileOverlay.classList.contains('is-open')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
});

const navLinks = document.querySelectorAll('.mobile-nav-list a');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        menuBtn.classList.remove('active');
        mobileOverlay.classList.remove('is-open');
        document.body.style.overflow = '';
    });
});
const observerOptions = {
    threshold: 0.2
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, observerOptions);

document.querySelectorAll('.animate-on-scroll').forEach(element => {
    observer.observe(element);
});

window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('loader-wrapper').classList.add('loader-hidden');
    }, 1000);
});

async function loadGallery() {
    try {
        const response = await fetch('/gallery.json');
        const galleryItems = await response.json();

        const galleryGrid = document.getElementById('galleryGrid');
        if (!galleryGrid) return; // Safety check

        // 1. SHUFFLE: Randomize the array order
        const shuffledItems = galleryItems.sort(() => 0.5 - Math.random());

        // 2. LIMIT: Take only the first 12 items from the shuffled list
        const selectedItems = shuffledItems.slice(0, 12);

        // 3. RENDER: Loop through the 12 random items
        selectedItems.forEach(item => {
            const card = document.createElement('div');
            card.className = `gallery-card gallery-${item.size || 'square'} animate-on-scroll`;

            let media;
            if (item.type === 'video') {
                media = document.createElement('video');
                media.src = item.src;
                media.autoplay = true;
                media.muted = true;
                media.loop = true;
                media.playsInline = true;
            } else {
                media = document.createElement('img');
                media.src = item.src;
                media.alt = item.alt || "Sonia's Salon Gallery";
            }

            const overlay = document.createElement('div');
            overlay.className = 'gallery-overlay-new';

            card.appendChild(media);
            card.appendChild(overlay);
            galleryGrid.appendChild(card);
        });

        // Re-run the observer to animate the newly added cards
        if (typeof observer !== 'undefined') {
            document.querySelectorAll('#galleryGrid .animate-on-scroll').forEach(el => {
                observer.observe(el);
            });
        }

    } catch (error) {
        console.error('Failed to load gallery:', error);
    }
}

// IMPORTANT: Make sure to call the function!
document.addEventListener('DOMContentLoaded', loadGallery);


// ========================================
// FOOTER ACCORDION TOGGLE (Mobile Only)
// ========================================
function toggleFooterSection(button) {
    const column = button.closest('.footer-column');
    const wasOpen = column.classList.contains('open');

    // Close all other sections (optional - remove if you want multiple open)
    document.querySelectorAll('.footer-column').forEach(col => {
        col.classList.remove('open');
    });

    // Toggle current section
    if (!wasOpen) {
        column.classList.add('open');
    }
}

// Auto-open all sections on desktop
function handleFooterResize() {
    if (window.innerWidth >= 992) {
        document.querySelectorAll('.footer-column').forEach(col => {
            col.classList.add('open');
        });
    } else {
        document.querySelectorAll('.footer-column').forEach(col => {
            col.classList.remove('open');
        });
    }
}
const scriptURL = 'https://script.google.com/macros/s/AKfycbya4kpiom1mWMaHkKMKUEPQnfvai8wszbPIf8PAAW3vhihVQr1esun-LUI6fpHe5EPM5w/exec';
const form = document.getElementById('contactForm');
const submitBtn = form.querySelector('button[type="submit"]');
const btnText = submitBtn.querySelector('span');

form.addEventListener('submit', e => {
    e.preventDefault();

    // Luxury Feedback State
    submitBtn.disabled = true;
    btnText.innerText = "Processing Inquiry...";
    submitBtn.style.opacity = "0.6";

    fetch(scriptURL, { method: 'POST', body: new FormData(form) })
        .then(response => {
            btnText.innerText = "Inquiry Sent Successfully";
            submitBtn.style.backgroundColor = "#b76e79";
            form.reset();

            setTimeout(() => {
                submitBtn.disabled = false;
                btnText.innerText = "Send Message";
                submitBtn.style.opacity = "1";
            }, 5000);
        })
        .catch(error => {
            btnText.innerText = "Error. Please call us.";
            submitBtn.disabled = false;
        });
});
// Run on load and resize

window.addEventListener('load', handleFooterResize);
window.addEventListener('resize', handleFooterResize);