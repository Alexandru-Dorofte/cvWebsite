const typedTextSpan = document.querySelector(".typed-text")
const cursorSpan = document.querySelector(".cursor");

const textArray = [
    "I'm a Site Reliability Engineer at TikTok.",
    "I keep big systems fast, stable and boring.",
    "I studied Software Engineering at DCU.",
    "In my spare time I build stuff.",
    "Let's connect on LinkedIn!",
    "Email me for my résumé."
];
const typingDelay = 45;
const erasingDelay = 25;
const newTextDelay = 1600;
let textArrayIndex = 0;
let charIndex = 0;

function type() {
    if(charIndex < textArray[textArrayIndex].length){
        if(!cursorSpan.classList.contains("typing")) cursorSpan.classList.add("typing");
        typedTextSpan.textContent += textArray[textArrayIndex].charAt(charIndex);
        charIndex++;
        setTimeout(type, typingDelay);
    }
    else {
        cursorSpan.classList.remove("typing");
        setTimeout(erase, newTextDelay);
    }
}

function erase() {
    if(charIndex > 0) {
        if(!cursorSpan.classList.contains("typing")) cursorSpan.classList.add("typing");
        typedTextSpan.textContent = textArray[textArrayIndex].substring(0,charIndex-1);
        charIndex--;
        setTimeout(erase, erasingDelay);
    }
    else {
        cursorSpan.classList.remove("typing");
        textArrayIndex++;
        if(textArrayIndex>=textArray.length) textArrayIndex=0;
        setTimeout(type, 500);
    }
}

document.addEventListener("DOMContentLoaded", function() {
   if(textArray.length) setTimeout(type, typingDelay + 250);
});

document.addEventListener("DOMContentLoaded", function() {
    document.querySelector(".scroll-dwn-link").addEventListener("click", function(e) {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        e.preventDefault();
        const startY = window.scrollY;
        const distance = document.querySelector(".experience").getBoundingClientRect().top;
        const duration = 900;
        const start = performance.now();
        function step(now) {
            const t = Math.min((now - start) / duration, 1);
            const ease = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            window.scrollTo({ top: startY + distance * ease, behavior: "instant" });
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    });
});

document.addEventListener("DOMContentLoaded", function() {
    const link = document.querySelector(".scroll-dwn-link");
    function dismiss() {
        link.classList.remove("hint");
        window.removeEventListener("scroll", onScroll);
    }
    function onScroll() {
        if (window.scrollY > 40) dismiss();
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    setTimeout(function() {
        if (window.scrollY <= 40) link.classList.add("hint");
    }, 2500);
});
