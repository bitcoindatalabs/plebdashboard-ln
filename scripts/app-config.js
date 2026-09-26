// Centralized app configuration for PlebDashboard-LN
const UNIFIED_NAV_LINKS = [
    { name: 'Home', url: 'index.html' },
    { name: 'Rankings', url: 'prank.html' },
    { name: 'Explorer', url: 'explorer.html' },
    { name: 'Comparison', url: 'node-comparison.html' },
    { name: 'Graph Viz', url: 'graph.html' }
];

function sanitizeNavLinks() {
    const appNav = document.getElementById('appNavLinks');
    const mobileNav = document.getElementById('mobileNavContent');
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navHtml = UNIFIED_NAV_LINKS.map(link => {
        const isActive = currentPath === link.url || (currentPath === '' && link.url === 'index.html');
        return `<a href="${link.url}" class="nav-link ${isActive ? 'active' : ''}">${link.name}</a>`;
    }).join('');

    if (appNav) {
        if (appNav.innerHTML.includes('node-explorer') || 
            appNav.innerHTML.includes('channel-explorer') || 
            appNav.innerHTML.includes('Node Explorer') || 
            appNav.innerHTML.includes('Channel Explorer') ||
            !appNav.innerHTML.includes('explorer.html')) {
            appNav.innerHTML = navHtml;
        }
    }
    if (mobileNav) {
        if (mobileNav.innerHTML.includes('node-explorer') || 
            mobileNav.innerHTML.includes('channel-explorer') || 
            mobileNav.innerHTML.includes('Node Explorer') || 
            mobileNav.innerHTML.includes('Channel Explorer') ||
            !mobileNav.innerHTML.includes('explorer.html')) {
            mobileNav.innerHTML = navHtml;
        }
    }
}

function initAppConfig() {
    if (typeof BitcoinLabsApp !== 'undefined') {
        BitcoinLabsApp.init({
            isApp: true,
            appName: "plebdashboard-ln",
            appHomeUrl: "https://lightning.bitcoindatalabs.org/",
            navLinks: UNIFIED_NAV_LINKS
        });
        setTimeout(sanitizeNavLinks, 100);
        setTimeout(sanitizeNavLinks, 300);
        setTimeout(sanitizeNavLinks, 600);
    } else {
        setTimeout(initAppConfig, 50);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAppConfig();
        sanitizeNavLinks();
    });
} else {
    initAppConfig();
    sanitizeNavLinks();
}

// Active observer to prevent stale cache or late loads from restoring old tabs
const navObserver = new MutationObserver(() => {
    sanitizeNavLinks();
});
if (document.documentElement) {
    navObserver.observe(document.documentElement, { childList: true, subtree: true });
}
[50, 150, 300, 600, 1200, 2500].forEach(delay => setTimeout(sanitizeNavLinks, delay));

document.addEventListener('DOMContentLoaded', () => {

    // Initialize search clear buttons globally
    const setupClearButtons = () => {
        const searchInputs = document.querySelectorAll('.search-input, .search-input-hero');
        searchInputs.forEach(input => {
            const container = input.closest('.search-container, .search-input-container');
            if (!container) return;
            const clearBtn = container.querySelector('.search-clear-btn');
            if (!clearBtn) return;

            // Toggle visibility on input
            input.addEventListener('input', () => {
                if (input.value.length > 0) {
                    clearBtn.classList.add('visible');
                    input.classList.add('has-value');
                } else {
                    clearBtn.classList.remove('visible');
                    input.classList.remove('has-value');
                }
            });

            // Clear on click
            clearBtn.addEventListener('click', () => {
                input.value = '';
                clearBtn.classList.remove('visible');
                input.classList.remove('has-value');
                input.focus();
                // Trigger input event so active page scripts update
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });

            // Set initial state if browser auto-filled or populated via URL params
            if (input.value.length > 0) {
                clearBtn.classList.add('visible');
                input.classList.add('has-value');
            }
        });
    };
    
    // Slight delay to ensure DOM and other frameworks are fully ready
    setTimeout(setupClearButtons, 100);
});
