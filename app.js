class CircularGestureDetector {
    constructor(gestureArea, carousel) {
        this.gestureArea = gestureArea;
        this.carousel = carousel;
        this.touchPoints = [];
        this.isTracking = false;
        this.minRadius = 20;
        this.maxRadius = 150;
        this.minPoints = 5;
        this.center = { x: 0, y: 0 };
        this.pathElement = document.getElementById('pathElement');
        this.gestureIndicator = document.getElementById('gestureIndicator');
        this.debugInfo = document.getElementById('debugInfo');
        this.lastScrollTime = 0;
        this.scrollThrottle = 300;
        this.lastAngle = null;
        this.lastAngleTime = null;
        this.totalAngle = 0;
        this.initialScrollPosition = 0;
        this.angleToPixelRatio = 0;
        this.targetScrollPosition = 0;
        this.currentScrollPosition = 0;
        this.animationFrameId = null;
        this.smoothingFactor = 0.6;
        this.lastTargetUpdate = 0;
        this.angularVelocity = 0;
        this.angularVelocityHistory = [];
        this.maxVelocityHistory = 5;
        this.angleHistory = []; // Storico angoli per smoothing
        this.maxAngleHistory = 3; // Numero di angoli da mantenere per smoothing
        this.accumulatedAngle = 0;
        this.accumulatedAngleCounterClockwise = 0;
        this.carouselTouchStartX = null;
        this.carouselTouchStartY = null;
        this.browserSwipeStartX = null;
        this.browserSwipeStartY = null;
        this.browserSwipeStartTime = null;
        this.pullToRefresh = document.getElementById('pullToRefresh');
        this.pullStartY = null;
        this.pullCurrentY = null;
        this.pullThreshold = 80;
        this.isPulling = false;
        
        this.init();
    }

    init() {
        this.gestureArea.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.gestureArea.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.gestureArea.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        
        this.carousel.addEventListener('touchmove', this.preventCarouselSwipe.bind(this), { passive: false });
        this.carousel.addEventListener('touchstart', this.handleCarouselTouchStart.bind(this), { passive: false });
        this.carousel.addEventListener('touchend', this.handleCarouselTouchEnd.bind(this), { passive: false });
        
        document.addEventListener('touchstart', this.preventBrowserSwipeStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.preventBrowserSwipeMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.preventBrowserSwipeEnd.bind(this), { passive: false });
        
        document.addEventListener('touchstart', this.handlePullStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.handlePullMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handlePullEnd.bind(this), { passive: false });
        
        const rect = this.gestureArea.getBoundingClientRect();
        this.center = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };

        this.gestureArea.addEventListener('dblclick', () => {
            this.debugInfo.classList.toggle('active');
        });
    }

    handleCarouselTouchStart(e) {
        this.carouselTouchStartX = e.touches[0].clientX;
        this.carouselTouchStartY = e.touches[0].clientY;
    }

    preventCarouselSwipe(e) {
        if (this.isPulling || this.pullStartY !== null) return;
        if (!this.carouselTouchStartX || !this.carouselTouchStartY) return;
        
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - this.carouselTouchStartX);
        const deltaY = Math.abs(touch.clientY - this.carouselTouchStartY);
        
        if (deltaX > 10 && deltaX > deltaY) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    handleCarouselTouchEnd(e) {
        this.carouselTouchStartX = null;
        this.carouselTouchStartY = null;
    }

    preventBrowserSwipeStart(e) {
        const touch = e.touches[0];
        this.browserSwipeStartX = touch.clientX;
        this.browserSwipeStartY = touch.clientY;
        this.browserSwipeStartTime = Date.now();
    }

    preventBrowserSwipeMove(e) {
        const touch = e.touches[0];
        const rect = this.gestureArea.getBoundingClientRect();
        const touchX = touch.clientX;
        const touchY = touch.clientY;
        
        if (touchX >= rect.left && touchX <= rect.right && 
            touchY >= rect.top && touchY <= rect.bottom) {
            return;
        }
        
        const carouselRect = this.carousel.getBoundingClientRect();
        if (touchX >= carouselRect.left && touchX <= carouselRect.right && 
            touchY >= carouselRect.top && touchY <= carouselRect.bottom) {
            return;
        }
        
        if (this.browserSwipeStartX !== null && this.browserSwipeStartY !== null) {
            const deltaX = touch.clientX - this.browserSwipeStartX;
            const deltaY = touch.clientY - this.browserSwipeStartY;
            const absDeltaX = Math.abs(deltaX);
            const absDeltaY = Math.abs(deltaY);
            
            const isAtFirstCard = this.carousel.scrollLeft <= 50;
            if ((this.browserSwipeStartY < 100 || isAtFirstCard) && deltaY > 0 && absDeltaY > absDeltaX) {
                return;
            }
            
            const screenWidth = window.innerWidth;
            const isLeftEdge = this.browserSwipeStartX < 20;
            const isRightEdge = this.browserSwipeStartX > screenWidth - 20;
            
            if ((isLeftEdge || isRightEdge) && absDeltaX > 10 && absDeltaX > absDeltaY) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            
            if (absDeltaX > 30 && absDeltaX > absDeltaY * 1.5) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }
    }

    preventBrowserSwipeEnd(e) {
        this.browserSwipeStartX = null;
        this.browserSwipeStartY = null;
        this.browserSwipeStartTime = null;
    }

    handlePullStart(e) {
        const touch = e.touches[0];
        const startY = touch.clientY;
        const startX = touch.clientX;
        const isAtFirstCard = this.carousel.scrollLeft <= 50;
        const carouselRect = this.carousel.getBoundingClientRect();
        const isOnCarousel = startX >= carouselRect.left && startX <= carouselRect.right && 
                             startY >= carouselRect.top && startY <= carouselRect.bottom;
        
        if ((startY < 100 || (isOnCarousel && isAtFirstCard)) && !this.isTracking) {
            const rect = this.gestureArea.getBoundingClientRect();
            const isOnGestureArea = startX >= rect.left && startX <= rect.right && 
                                   startY >= rect.top && startY <= rect.bottom;
            
            if (!isOnGestureArea) {
                this.pullStartY = startY;
                this.isPulling = false;
            }
        }
    }

    handlePullMove(e) {
        if (this.pullStartY === null) return;
        
        const touch = e.touches[0];
        const currentY = touch.clientY;
        const deltaY = currentY - this.pullStartY;
        const isAtFirstCard = this.carousel.scrollLeft <= 50;
        
        if (deltaY > 0 && isAtFirstCard) {
            e.preventDefault();
            e.stopPropagation();
            
            if (deltaY > 15) {
                this.isPulling = true;
                const pullDistance = Math.min(deltaY, this.pullThreshold * 1.5);
                const opacity = Math.min(pullDistance / this.pullThreshold, 1);
                
                this.pullToRefresh.style.transform = `translateY(${Math.min(pullDistance - 60, 0)}px)`;
                this.pullToRefresh.style.opacity = opacity;
                
                if (pullDistance >= this.pullThreshold) {
                    this.pullToRefresh.classList.add('active');
                    this.pullToRefresh.querySelector('span').textContent = 'Rilascia per ricaricare';
                } else {
                    this.pullToRefresh.classList.remove('active');
                    this.pullToRefresh.querySelector('span').textContent = 'Tira per ricaricare';
                }
            }
        } else {
            this.resetPullToRefresh();
        }
    }

    handlePullEnd(e) {
        if (this.pullStartY === null) return;
        
        const touch = e.changedTouches[0];
        const currentY = touch.clientY;
        const deltaY = currentY - this.pullStartY;
        
        if (this.isPulling && deltaY >= this.pullThreshold) {
            this.pullToRefresh.classList.add('active');
            this.pullToRefresh.querySelector('span').textContent = 'Ricaricamento...';
            
            setTimeout(() => {
                window.location.reload();
            }, 300);
        } else {
            this.resetPullToRefresh();
        }
        
        this.pullStartY = null;
        this.isPulling = false;
    }

    resetPullToRefresh() {
        this.pullToRefresh.style.transform = 'translateY(-100%)';
        this.pullToRefresh.style.opacity = '0';
        this.pullToRefresh.classList.remove('active');
    }

    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.gestureArea.getBoundingClientRect();
        const touchX = touch.clientX;
        const touchY = touch.clientY;

        if (touchX >= rect.left && touchX <= rect.right && 
            touchY >= rect.top && touchY <= rect.bottom) {
            this.isTracking = true;
            this.touchPoints = [];
            this.accumulatedAngle = 0;
            this.accumulatedAngleCounterClockwise = 0;
            this.lastAngle = null;
            this.lastAngleTime = null;
            this.totalAngle = 0;
            this.initialScrollPosition = this.carousel.scrollLeft;
            this.currentScrollPosition = this.carousel.scrollLeft;
            this.targetScrollPosition = this.carousel.scrollLeft;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            this.angleToPixelRatio = this.carousel.clientWidth / (2 * Math.PI);
            this.angularVelocity = 0;
            this.angularVelocityHistory = [];
            this.angleHistory = [];
            this.lastScrollTime = 0;
            this.center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            this.addTouchPoint(touchX, touchY);
            this.gestureIndicator.classList.add('active');
            this.updateDebugInfo('Tracciamento...', this.touchPoints.length);
        }
    }

    handleTouchMove(e) {
        if (!this.isTracking) return;
        e.preventDefault();
        const touch = e.touches[0];
        this.addTouchPoint(touch.clientX, touch.clientY);
        this.updatePath();
        
        if (this.touchPoints.length >= 2) {
            this.detectContinuousGesture();
        }
        
        this.updateDebugInfo('Tracciamento...', this.touchPoints.length);
    }

    handleTouchEnd(e) {
        if (!this.isTracking) return;
        e.preventDefault();
        
        this.isTracking = false;
        this.touchPoints = [];
        this.accumulatedAngle = 0;
        this.accumulatedAngleCounterClockwise = 0;
        this.lastAngle = null;
        this.lastAngleTime = null;
        this.totalAngle = 0;
        this.angularVelocity = 0;
        this.angularVelocityHistory = [];
        this.angleHistory = [];
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.gestureIndicator.classList.remove('active');
        this.pathElement.setAttribute('d', '');
        this.pathElement.classList.remove('active');
        
        this.snapToNearestCard();
        
        setTimeout(() => {
            this.updateDebugInfo('Inattivo', 0);
        }, 2000);
    }

    snapToNearestCard() {
        const carousel = this.carousel;
        const carouselRect = carousel.getBoundingClientRect();
        const carouselCenter = carouselRect.left + carouselRect.width / 2;
        const items = carousel.querySelectorAll('.carousel-item');
        
        let nearestItem = null;
        let minDistance = Infinity;
        
        items.forEach((item) => {
            const itemRect = item.getBoundingClientRect();
            const itemCenter = itemRect.left + itemRect.width / 2;
            const distanceFromCenter = Math.abs(itemCenter - carouselCenter);
            
            if (distanceFromCenter < minDistance) {
                minDistance = distanceFromCenter;
                nearestItem = item;
            }
        });
        
        if (nearestItem) {
            const itemOffsetLeft = nearestItem.offsetLeft;
            const itemWidth = nearestItem.offsetWidth;
            const carouselWidth = carousel.clientWidth;
            const scrollPosition = itemOffsetLeft - (carouselWidth / 2) + (itemWidth / 2);
            const maxScroll = carousel.scrollWidth - carousel.clientWidth;
            const clampedScroll = Math.max(0, Math.min(scrollPosition, maxScroll));
            
            carousel.scrollTo({
                left: clampedScroll,
                behavior: 'smooth'
            });
        }
    }

    addTouchPoint(x, y) {
        const relativeX = x - this.center.x;
        const relativeY = y - this.center.y;
        const distance = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
        
        this.touchPoints.push({
            x: x,
            y: y,
            relativeX: relativeX,
            relativeY: relativeY,
            distance: distance,
            angle: Math.atan2(relativeY, relativeX)
        });
    }

    updatePath() {
        if (this.touchPoints.length < 2) return;
        
        const pathData = this.touchPoints.map((point, index) => {
            const relativeX = point.x - this.gestureArea.getBoundingClientRect().left;
            const relativeY = point.y - this.gestureArea.getBoundingClientRect().top;
            return `${index === 0 ? 'M' : 'L'} ${relativeX} ${relativeY}`;
        }).join(' ');
        
        this.pathElement.setAttribute('d', pathData);
        this.pathElement.classList.add('active');
    }

    detectContinuousGesture() {
        if (this.touchPoints.length < 2) return;
        
        const lastPoint = this.touchPoints[this.touchPoints.length - 1];
        // Ricalcola il centro per garantire precisione
        const rect = this.gestureArea.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = lastPoint.x - centerX;
        const dy = lastPoint.y - centerY;
        let currentAngle = Math.atan2(dy, dx);
        
        // Aggiungi l'angolo corrente allo storico
        this.angleHistory.push(currentAngle);
        if (this.angleHistory.length > this.maxAngleHistory) {
            this.angleHistory.shift();
        }
        
        // Calcola l'angolo medio per smoothing (solo se abbiamo abbastanza punti)
        if (this.angleHistory.length >= 2) {
            // Per calcolare la media di angoli, devi gestire il wrap-around
            let sumSin = 0;
            let sumCos = 0;
            for (const angle of this.angleHistory) {
                sumSin += Math.sin(angle);
                sumCos += Math.cos(angle);
            }
            const avgAngle = Math.atan2(sumSin / this.angleHistory.length, sumCos / this.angleHistory.length);
            currentAngle = avgAngle;
        }
        
        if (this.lastAngle !== null) {
            let angleDiff = currentAngle - this.lastAngle;
            
            // Normalizza l'angolo per gestire il passaggio da -π a π
            // Usa un metodo più robusto che considera entrambe le direzioni possibili
            const normalizedDiff1 = angleDiff;
            const normalizedDiff2 = angleDiff > 0 ? angleDiff - 2 * Math.PI : angleDiff + 2 * Math.PI;
            
            // Scegli la normalizzazione con la differenza più piccola (più vicina)
            let angleDiffNormalized = Math.abs(normalizedDiff1) < Math.abs(normalizedDiff2) 
                ? normalizedDiff1 
                : normalizedDiff2;
            
            // Filtra cambiamenti troppo bruschi (probabilmente errori di misurazione)
            // Se il cambio è più di 90 gradi (π/2), probabilmente è un errore
            const maxAngleChange = Math.PI / 2; // 90 gradi
            
            if (Math.abs(angleDiffNormalized) > maxAngleChange) {
                // Se il cambio è troppo grande, probabilmente è un errore di normalizzazione
                // Ignora questo punto e mantieni l'angolo precedente
                return;
            }
            
            // Accumula l'angolo totale (positivo = orario, negativo = antiorario)
            this.totalAngle += angleDiffNormalized;
            
            // Converti l'angolo totale in pixel di scroll
            const scrollDelta = this.totalAngle * this.angleToPixelRatio;
            const newScrollPosition = this.initialScrollPosition + scrollDelta;
            
            // Limita lo scroll ai limiti del carosello
            const maxScroll = this.carousel.scrollWidth - this.carousel.clientWidth;
            const clampedScrollPosition = Math.max(0, Math.min(newScrollPosition, maxScroll));
            
            // Aggiorna la posizione target per lo smoothing
            this.targetScrollPosition = clampedScrollPosition;
            
            // Avvia l'animazione smooth se non è già attiva
            if (!this.animationFrameId) {
                this.animateScroll();
            }
        }
        
        this.lastAngle = currentAngle;
    }

    animateScroll() {
        this.currentScrollPosition = this.carousel.scrollLeft;
        const diff = this.targetScrollPosition - this.currentScrollPosition;
        
        if (Math.abs(diff) < 0.1) {
            this.carousel.scrollLeft = this.targetScrollPosition;
            this.currentScrollPosition = this.targetScrollPosition;
            this.animationFrameId = null;
            return;
        }
        
        const dynamicFactor = Math.min(this.smoothingFactor * (1 + Math.abs(diff) * 0.01), 0.95);
        const newPosition = this.currentScrollPosition + diff * dynamicFactor;
        
        this.carousel.scrollLeft = newPosition;
        this.currentScrollPosition = newPosition;
        
        if (this.isTracking || Math.abs(diff) > 0.5) {
            this.animationFrameId = requestAnimationFrame(() => this.animateScroll());
        } else {
            this.animationFrameId = null;
        }
    }

    updateDebugInfo(status, pointCount, direction = '-') {
        if (!this.debugInfo.classList.contains('active')) return;
        
        document.getElementById('gestureStatus').textContent = status;
        document.getElementById('pointCount').textContent = pointCount;
        
        if (this.touchPoints.length > 1) {
            const lastAngle = this.touchPoints[this.touchPoints.length - 1].angle;
            const degrees = Math.round((lastAngle * 180) / Math.PI);
            document.getElementById('angle').textContent = degrees + '°';
        } else {
            document.getElementById('angle').textContent = '0°';
        }
        
        document.getElementById('direction').textContent = direction;
    }
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then((registration) => {
                console.log('Service Worker registrato con successo:', registration.scope);
                
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('Nuovo Service Worker disponibile');
                        }
                    });
                });
            })
            .catch((error) => {
                console.log('Registrazione Service Worker fallita:', error);
            });
    });
}

// PWA Install Prompt
let deferredPrompt;

// Rileva il dispositivo e browser
function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isChrome = /chrome/.test(ua) && !/edg/.test(ua);
    const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
    const isChromeIOS = isIOS && isChrome;
    const isSafariIOS = isIOS && isSafari;
    
    return {
        isIOS,
        isAndroid,
        isChrome,
        isSafari,
        isChromeIOS,
        isSafariIOS
    };
}

// Verifica se l'app è già installata
function isAppInstalled() {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return true;
    }
    if (window.navigator.standalone === true) {
        return true;
    }
    if (document.referrer.includes('android-app://')) {
        return true;
    }
    return false;
}

// Verifica se il browser supporta l'installazione
function isInstallable() {
    const device = detectDevice();
    
    // Su Safari iOS, l'app è sempre installabile (tramite "Aggiungi alla schermata Home")
    // anche se non supporta beforeinstallprompt
    if (device.isSafariIOS || device.isIOS) {
        // Controlla se è già installata
        if (isAppInstalled()) {
            console.log('App già installata su iOS');
            return false;
        }
        // Su iOS, l'app è installabile anche senza manifest (usa meta tag)
        return true;
    }
    
    // Per altri browser, controlla il manifest
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) {
        console.log('Manifest non trovato');
        return false;
    }
    
    // Controlla se è già installata
    if (isAppInstalled()) {
        console.log('App già installata');
        return false;
    }
    
    return true;
}

// Ottieni il messaggio di installazione personalizzato per il browser
function getInstallMessage() {
    const device = detectDevice();
    
    if (device.isChromeIOS) {
        return 'Per installare l\'app su iOS, apri questa pagina in Safari e usa "Condividi" > "Aggiungi alla schermata Home"';
    } else if (device.isSafariIOS) {
        return 'Tocca il pulsante Condividi e seleziona "Aggiungi alla schermata Home"';
    } else if (device.isAndroid && device.isChrome) {
        return 'Installa l\'app per un\'esperienza migliore';
    } else {
        return 'Installa l\'app per un\'esperienza migliore';
    }
}

// Mostra il prompt di installazione
function showInstallPrompt() {
    const installPrompt = document.getElementById('installPrompt');
    if (!installPrompt) return;
    
    // Non mostrare se già chiuso dall'utente
    if (localStorage.getItem('installPromptDismissed')) {
        return;
    }
    
    // Non mostrare se già installata
    if (isAppInstalled()) {
        return;
    }
    
    // Aggiorna il testo del prompt in base al browser
    const installPromptText = installPrompt.querySelector('.install-prompt-text');
    if (installPromptText) {
        installPromptText.textContent = getInstallMessage();
    }
    
    installPrompt.classList.add('show');
}

// Event listener per beforeinstallprompt
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('beforeinstallprompt evento ricevuto');
    e.preventDefault();
    deferredPrompt = e;
    
    setTimeout(() => {
        if (isInstallable()) {
            showInstallPrompt();
        }
    }, 3000);
});

// Mostra il prompt anche se beforeinstallprompt non viene attivato (per alcuni browser)
window.addEventListener('load', () => {
    const device = detectDevice();
    
    // Su Safari iOS, mostra il prompt più velocemente (non supporta beforeinstallprompt)
    const delay = device.isSafariIOS ? 2000 : 5000;
    
    setTimeout(() => {
        // Se dopo il delay non abbiamo ancora deferredPrompt ma l'app è installabile
        if (!deferredPrompt && isInstallable()) {
            console.log('Prompt manuale - browser potrebbe non supportare beforeinstallprompt');
            console.log('Device:', device);
            // Mostra comunque il prompt, ma con messaggio diverso
            showInstallPrompt();
        }
    }, delay);
});

// Inizializza quando il DOM è pronto
document.addEventListener('DOMContentLoaded', () => {
    const gestureArea = document.getElementById('gestureArea');
    const carousel = document.getElementById('carousel');
    
    if (gestureArea && carousel) {
        new CircularGestureDetector(gestureArea, carousel);
    }
    
    // Setup install prompt
    const installPrompt = document.getElementById('installPrompt');
    if (installPrompt) {
        const installButton = installPrompt.querySelector('.install-prompt-install');
        const dismissButton = installPrompt.querySelector('.install-prompt-dismiss');
        
        if (installButton) {
            installButton.addEventListener('click', async () => {
                const device = detectDevice();
                
                if (device.isChromeIOS) {
                    // Chrome iOS: mostra istruzioni per aprire in Safari
                    const openInSafari = confirm(
                        'Chrome iOS non supporta l\'installazione diretta di app.\n\n' +
                        'Vuoi aprire questa pagina in Safari?\n\n' +
                        'In Safari, tocca il pulsante Condividi e seleziona "Aggiungi alla schermata Home"'
                    );
                    if (openInSafari) {
                        // Prova ad aprire in Safari
                        const url = window.location.href;
                        window.location.href = url.replace('https://', 'x-safari-https://').replace('http://', 'x-safari-http://');
                        // Fallback: mostra istruzioni
                        setTimeout(() => {
                            alert('Copia questo link e aprilo in Safari:\n\n' + url);
                        }, 1000);
                    }
                    installPrompt.classList.remove('show');
                    localStorage.setItem('installPromptDismissed', 'true');
                } else if (device.isSafariIOS || device.isIOS) {
                    // Safari iOS: mostra istruzioni visuali più chiare
                    const instructions = `
Per installare l'app su iOS:

1. Tocca il pulsante Condividi 📤
   (icona quadrato con freccia in alto)

2. Scorri verso il basso nel menu

3. Tocca "Aggiungi alla schermata Home" ➕

4. Tocca "Aggiungi" in alto a destra

L'app apparirà sulla tua schermata Home come un'app nativa!
                    `;
                    alert(instructions.trim());
                    installPrompt.classList.remove('show');
                } else if (deferredPrompt) {
                    // Chrome/Edge su Android o desktop
                    try {
                        deferredPrompt.prompt();
                        const { outcome } = await deferredPrompt.userChoice;
                        console.log(`Risultato installazione: ${outcome}`);
                        installPrompt.classList.remove('show');
                        if (outcome === 'accepted') {
                            localStorage.removeItem('installPromptDismissed');
                        }
                    } catch (error) {
                        console.error('Errore durante l\'installazione:', error);
                        // Fallback: mostra istruzioni manuali
                        if (device.isAndroid) {
                            alert('Per installare l\'app, tocca il menu del browser (tre puntini) e seleziona "Installa app" o "Aggiungi alla schermata Home"');
                        } else {
                            alert('Per installare l\'app, usa il menu del browser:\n\nChrome: Menu > Installa app');
                        }
                    }
                    deferredPrompt = null;
                } else {
                    // Fallback per browser che non supportano beforeinstallprompt
                    if (device.isAndroid) {
                        alert('Per installare l\'app, tocca il menu del browser (tre puntini) e seleziona "Installa app" o "Aggiungi alla schermata Home"');
                    } else {
                        alert('Per installare l\'app, usa il menu del browser:\n\nChrome: Menu > Installa app');
                    }
                    installPrompt.classList.remove('show');
                }
            });
        }
        
        if (dismissButton) {
            dismissButton.addEventListener('click', () => {
                installPrompt.classList.remove('show');
                localStorage.setItem('installPromptDismissed', 'true');
            });
        }
        
        // Su Safari iOS, mostra il prompt anche subito dopo DOMContentLoaded se non è già stato mostrato
        const device = detectDevice();
        if (device.isSafariIOS && !localStorage.getItem('installPromptDismissed') && !isAppInstalled()) {
            setTimeout(() => {
                if (!installPrompt.classList.contains('show')) {
                    showInstallPrompt();
                }
            }, 1500);
        }
    }
    
    // Debug: log dello stato dell'installazione
    const device = detectDevice();
    console.log('PWA Install Status:', {
        device: device,
        isInstalled: isAppInstalled(),
        isInstallable: isInstallable(),
        hasDeferredPrompt: !!deferredPrompt,
        manifestPresent: !!document.querySelector('link[rel="manifest"]')
    });
});

