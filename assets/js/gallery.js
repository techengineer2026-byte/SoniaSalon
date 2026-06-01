let allGalleryItems = [];
let currentIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    loadFullGallery();
    setupLightbox();
});

async function loadFullGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    try {
        const response = await fetch('/gallery.json');
        if (!response.ok) {
            throw new Error('Failed to fetch gallery.json');
        }

        allGalleryItems = await response.json();
        grid.innerHTML = '';

        allGalleryItems.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = `gallery-card gallery-${item.size || 'square'} animate-on-scroll`;

            let media;
            if (item.type === 'video') {
                media = document.createElement('video');
                media.src = item.src;
                media.muted = true;
                media.loop = true;
                media.playsInline = true;
                media.setAttribute('preload', 'metadata');
            } else {
                media = document.createElement('img');
                media.src = item.src;
                media.alt = item.alt || item.title || 'Gallery image';
                media.loading = 'lazy';
            }

            const overlay = document.createElement('div');
            overlay.className = 'gallery-overlay-new';
            overlay.innerHTML = `
                <div class="overlay-content">
                    <span class="overlay-tag">${item.title || ''}</span>
                    <p class="overlay-desc">${item.subtitle || ''}</p>
                </div>
            `;

            card.appendChild(media);
            card.appendChild(overlay);

            card.addEventListener('click', () => {
                openLightbox(index);
            });

            grid.appendChild(card);
        });

        if (typeof observer !== 'undefined') {
            document.querySelectorAll('#galleryGrid .animate-on-scroll').forEach(el => {
                observer.observe(el);
            });
        }

        autoPlayVisibleVideos();

    } catch (error) {
        console.error('Error loading gallery:', error);
        grid.innerHTML = `
            <div class="text-center w-100">
                <p class="hero-desc">Unable to load gallery right now.</p>
            </div>
        `;
    }
}

function setupLightbox() {
    const lightbox = document.getElementById('luxuryLightbox');
    const closeBtn = document.querySelector('.lightbox-close');
    const prevBtn = document.querySelector('.lightbox-prev');
    const nextBtn = document.querySelector('.lightbox-next');

    if (!lightbox) return;

    closeBtn.addEventListener('click', closeLightbox);

    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        changeLightboxItem(-1);
    });

    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        changeLightboxItem(1);
    });

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;

        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') changeLightboxItem(-1);
        if (e.key === 'ArrowRight') changeLightboxItem(1);
    });
}

function openLightbox(index) {
    currentIndex = index;
    updateLightboxContent(true);

    const lightbox = document.getElementById('luxuryLightbox');
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.getElementById('luxuryLightbox');
    const container = document.getElementById('lightboxMediaContainer');

    lightbox.classList.remove('active');
    document.body.style.overflow = '';

    setTimeout(() => {
        container.innerHTML = '';
    }, 300);
}

function changeLightboxItem(direction) {
    const wrapper = document.querySelector('.lightbox-content-wrapper');
    if (!wrapper || allGalleryItems.length === 0) return;

    wrapper.classList.add('changing');

    setTimeout(() => {
        currentIndex += direction;

        if (currentIndex < 0) currentIndex = allGalleryItems.length - 1;
        if (currentIndex >= allGalleryItems.length) currentIndex = 0;

        updateLightboxContent(false);
        wrapper.classList.remove('changing');
    }, 220);
}

function updateLightboxContent(firstOpen = false) {
    const item = allGalleryItems[currentIndex];
    const container = document.getElementById('lightboxMediaContainer');
    const title = document.getElementById('lightboxTitle');
    const subtitle = document.getElementById('lightboxSubtitle');

    if (!item || !container) return;

    container.innerHTML = '';

    let media;
    if (item.type === 'video') {
        media = document.createElement('video');
        media.src = item.src;
        media.controls = true;
        media.autoplay = true;
        media.loop = true;
        media.playsInline = true;
        media.className = 'lightbox-media';
    } else {
        media = document.createElement('img');
        media.src = item.src;
        media.alt = item.alt || item.title || 'Gallery image';
        media.className = 'lightbox-media';
    }

    container.appendChild(media);
    title.textContent = item.title || '';
    subtitle.textContent = item.subtitle || '';

    if (firstOpen) {
        const wrapper = document.querySelector('.lightbox-content-wrapper');
        wrapper.classList.remove('changing');
    }
}

function autoPlayVisibleVideos() {
    const videos = document.querySelectorAll('#galleryGrid video');

    if (!videos.length) return;

    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;

            if (entry.isIntersecting) {
                video.play().catch(() => { });
            } else {
                video.pause();
            }
        });
    }, {
        threshold: 0.35
    });

    videos.forEach(video => videoObserver.observe(video));
}