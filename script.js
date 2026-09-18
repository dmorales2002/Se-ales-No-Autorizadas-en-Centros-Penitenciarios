const TECHS = [
    {name:"2G", freqMHz:850},
    {name:"3G", freqMHz:1900},
    {name:"4G", freqMHz:2100},
    {name:"5G Sub-6", freqMHz:3500},
    {name:"5G mmWave", freqMHz:28000},
];

// (índices 0–4 = 850 MHz, 1900 MHz, 2100 MHz, 3.5 GHz, 28 GHz). El cálculo es lineal:
const MATERIALS = [
    {name:"Ladrillo",           coef:[4, 5, 5, 7, 25]},
    {name:"Concreto reforzado", coef:[12, 12, 13, 15, 40]},
    {name:"Malla de acero (Faraday)", coef:[10, 15, 18, 25, 60]},
];

const REF_TX_DBM = -50;   // señal de referencia junto a la fuente
const THRESHOLD_DBM = -95; // sensibilidad típica de recepción móvil

const techSel = document.getElementById('tech');
const matSel = document.getElementById('material');
const thickSlider = document.getElementById('thickness');
const distSlider = document.getElementById('distance');

const techFreqLabel = document.getElementById('techFreqLabel');
const thickVal = document.getElementById('thickVal');
const distVal = document.getElementById('distVal');
const fsplOut = document.getElementById('fsplOut');
const wallOut = document.getElementById('wallOut');
const totalOut = document.getElementById('totalOut');
const rxOut = document.getElementById('rxOut');
const verdictTitle = document.getElementById('verdictTitle');
const verdictBadge = document.getElementById('verdictBadge');
const verdictBox = document.getElementById('verdictBox');

const canvas = document.getElementById('plan');
const ctx = canvas.getContext('2d');

// Perdida por espacio libre (FSPL)
//FSPL(dB) = 20·log₁₀(d_km) + 20·log₁₀(f_MHz) + 32.44
//4π/c --> c la velocidad de la luz (≈ 3×10⁸ m/s)
function fsplDb(distanceM, freqMHz){
    const dKm = Math.max(distanceM, 1) / 1000;
    return 20*Math.log10(dKm) + 20*Math.log10(freqMHz) + 32.44;
}

function compute(){
    const techIdx = parseInt(techSel.value);
    const matIdx = parseInt(matSel.value);
    const thickness = parseFloat(thickSlider.value);
    const distance = parseFloat(distSlider.value);

    const tech = TECHS[techIdx];
    const material = MATERIALS[matIdx];

    const fspl = fsplDb(distance, tech.freqMHz);
    const wallLoss = material.coef[techIdx] * thickness;
    const totalLoss = fspl + wallLoss;
    const rx = REF_TX_DBM - wallLoss; // efecto del blindaje sobre la señal en el perímetro

    techFreqLabel.textContent = tech.freqMHz >= 1000 ? (tech.freqMHz/1000)+" GHz" : tech.freqMHz+" MHz";
    thickVal.textContent = thickness.toFixed(2)+" m";
    distVal.textContent = distance+" m";

    fsplOut.textContent = fspl.toFixed(1)+" dB";
    wallOut.textContent = wallLoss.toFixed(1)+" dB";
    totalOut.textContent = totalLoss.toFixed(1)+" dB";
    rxOut.textContent = rx.toFixed(1)+" dBm";

    const blocked = rx < THRESHOLD_DBM;
    if(blocked){
        verdictTitle.textContent = "Comunicación bloqueada en el perímetro";
        verdictBadge.textContent = "CONFINADO";
        verdictBadge.style.background = "rgba(70,194,185,0.15)";
        verdictBadge.style.color = "var(--signal)";
        verdictBadge.style.border = "1px solid rgba(70,194,185,0.4)";
    } else {
        verdictTitle.textContent = "Señal aún viable fuera del recinto";
        verdictBadge.textContent = "FUGA DE SEÑAL";
        verdictBadge.style.background = "rgba(201,84,46,0.15)";
        verdictBadge.style.color = "var(--block)";
        verdictBadge.style.border = "1px solid rgba(201,84,46,0.4)";
    }

    drawPlan(thickness, distance, blocked, wallLoss);
}

function drawPlan(thickness, distance, blocked, wallLoss){
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    // grid
    ctx.strokeStyle = "#1B222C";
    ctx.lineWidth = 1;
    for(let x=0;x<w;x+=30){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke(); }
    for(let y=0;y<h;y+=30){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke(); }

    const cx = 130, cy = h/2;
    const wallX = 130 + Math.min(distance*14, 640);
    const wallThickPx = Math.max(thickness*40, 4);

    // propagation arcs (source side)
    const maxR = wallX - cx;
    const arcs = 5;
    for(let i=1;i<=arcs;i++){
        const r = (maxR/arcs)*i;
        const alpha = blocked ? 0.55 - i*0.08 : 0.6 - i*0.06;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(70,194,185,${Math.max(alpha,0.05)})`;
        ctx.lineWidth = 2;
        ctx.arc(cx, cy, r, -1.15, 1.15);
        ctx.stroke();
    }

    // source
    ctx.beginPath();
    ctx.fillStyle = "#46C2B9";
    ctx.arc(cx, cy, 7, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#DCE3EA";
    ctx.font = "12px 'IBM Plex Mono', monospace";
    ctx.fillText("Fuente RF", cx-24, cy+28);

    // wall
    ctx.fillStyle = "#3A4756";
    ctx.fillRect(wallX, 40, wallThickPx, h-80);
    ctx.strokeStyle = "#232B36";
    ctx.strokeRect(wallX, 40, wallThickPx, h-80);
    ctx.fillStyle = "#7C8A99";
    ctx.font = "11.5px 'IBM Plex Mono', monospace";
    ctx.save();
    ctx.translate(wallX + wallThickPx + 14, 55);
    ctx.fillText("muro · "+wallLoss.toFixed(1)+" dB", 0, 0);
    ctx.restore();

    // exterior side
    const exteriorColor = blocked ? "rgba(70,194,185,0.10)" : "rgba(201,84,46,0.18)";
    ctx.fillStyle = exteriorColor;
    ctx.fillRect(wallX+wallThickPx, 40, w-(wallX+wallThickPx)-30, h-80);

    if(!blocked){
        // leak waves beyond wall
        const leakStart = wallX+wallThickPx;
        for(let i=1;i<=3;i++){
            const r = 40*i;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(201,84,46,${0.5-i*0.1})`;
            ctx.lineWidth = 2;
            ctx.arc(leakStart, cy, r, -1.15, 1.15);
            ctx.stroke();
        }
        ctx.fillStyle = "#C9542E";
        ctx.font = "12px 'IBM Plex Mono', monospace";
        ctx.fillText("fuga hacia espectro concesionado", leakStart+16, cy-40);
    } else {
        ctx.fillStyle = "#46C2B9";
        ctx.font = "12px 'IBM Plex Mono', monospace";
        ctx.fillText("perímetro exterior protegido", wallX+wallThickPx+16, cy-40);
    }

    // perimeter label
    ctx.fillStyle = "#7C8A99";
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillText("límite del recinto", wallX-10, 34);
}

[techSel, matSel, thickSlider, distSlider].forEach(el=>{
    el.addEventListener('input', compute);
    el.addEventListener('change', compute);
});

compute();