(() => {
  const $ = (id) => document.getElementById(id);
  const q = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pickColor = (i = 0) =>
    [
      "#06b6d4",
      "#f59e0b",
      "#7ee787",
      "#ef4444",
      "#7c3aed",
      "#ffd166",
      "#66d9ef",
    ][i % 7];

  const state = {
    scale: 40,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    functions: [],
    stored: [],
    derivativeOverlay: false,
    secondDerivative: false,
    inequalityMode: false,
    vars: {},
    show3D: false,
    historyLimit: 400,
    canvasSize: { w: 800, h: 420 },
  };

  const canvas = $("graphCanvas");
  const ctx = canvas.getContext("2d");
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(200, rect.width);
    const h = Math.max(160, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.canvasSize = { w, h };
    drawAll();
  }
  window.addEventListener("resize", () => {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    resizeCanvas();
  });
  setTimeout(resizeCanvas, 60);

  function graphToCanvasX(gx) {
    return (
      state.canvasSize.w / 2 + gx * state.scale * state.zoom + state.offsetX
    );
  }
  function graphToCanvasY(gy) {
    return (
      state.canvasSize.h / 2 - gy * state.scale * state.zoom + state.offsetY
    );
  }
  function canvasToGraphX(cx) {
    return (
      (cx - state.canvasSize.w / 2 - state.offsetX) / (state.scale * state.zoom)
    );
  }
  function canvasToGraphY(cy) {
    return (
      (state.canvasSize.h / 2 - cy + state.offsetY) / (state.scale * state.zoom)
    );
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, state.canvasSize.w, state.canvasSize.h);
  }

  function drawGrid() {
    const w = state.canvasSize.w,
      h = state.canvasSize.h;
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    const pixPerUnit = state.scale * state.zoom;
    let step = 1;
    const target = 80;
    const raw = target / pixPerUnit;
    const exp = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const candidates = [1, 2, 5, 10];
    let best = 1;
    let bestDiff = Infinity;
    for (const c of candidates) {
      const val = c * exp;
      const diff = Math.abs(val - raw);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = val;
      }
    }
    step = best;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.beginPath();
    const leftUnits = canvasToGraphX(0),
      rightUnits = canvasToGraphX(w);
    const bottomUnits = canvasToGraphY(h),
      topUnits = canvasToGraphY(0);
    const startX = Math.floor(leftUnits / step) * step;
    const endX = Math.ceil(rightUnits / step) * step;
    for (let x = startX; x <= endX; x += step) {
      const px = graphToCanvasX(x);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    const startY = Math.floor(bottomUnits / step) * step;
    const endY = Math.ceil(topUnits / step) * step;
    for (let y = startY; y <= endY; y += step) {
      const py = graphToCanvasY(y);
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();
    ctx.closePath();

    ctx.beginPath();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#4b5563";
    const cx = graphToCanvasX(0),
      cy = graphToCanvasY(0);
    if (cy >= -1000 && cy <= h + 1000) {
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
    }
    if (cx >= -1000 && cx <= w + 1000) {
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
    }
    ctx.stroke();
    ctx.closePath();

    ctx.fillStyle = "#9aa6b2";
    ctx.font = "12px ui-monospace, monospace";
    for (let x = startX; x <= endX; x += step) {
      const px = graphToCanvasX(x);
      if (px < -30 || px > w + 30) continue;
      ctx.fillText(
        Number(x).toFixed(
          Math.max(0, Math.min(4, Math.ceil(-Math.log10(step))))
        ),
        px + 4,
        cy + 14
      );
    }
    for (let y = startY; y <= endY; y += step) {
      const py = graphToCanvasY(y);
      if (py < -10 || py > h + 10) continue;
      if (Math.abs(y) < 1e-9) continue;
      ctx.fillText(
        Number(y).toFixed(
          Math.max(0, Math.min(4, Math.ceil(-Math.log10(step))))
        ),
        cx + 6,
        py - 4
      );
    }
    ctx.restore();
  }

  function evaluateAt(compiled, x) {
    try {
      if (typeof compiled === "function") return compiled(x);
      return compiled.evaluate(Object.assign({ x }, state.vars));
    } catch {
      return NaN;
    }
  }

  function plotCompiled(compiled, color = "#06b6d4", stroke = 2) {
    const w = state.canvasSize.w;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = stroke;
    ctx.strokeStyle = color;
    let started = false;
    const stepPx = clamp(2, 1, 6);
    for (let px = 0; px <= w; px += stepPx) {
      const gx = canvasToGraphX(px);
      const y = evaluateAt(compiled, gx);
      if (!isFinite(y)) {
        started = false;
        continue;
      }
      const py = graphToCanvasY(y);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }

  function shadeInequality(exprStr) {
    if (!exprStr) return;
    const m = exprStr.match(/^\s*y\s*([<>]=?)\s*(.*)$/i);
    if (!m) return;
    const op = m[1],
      rhs = m[2];
    let compiled;
    try {
      compiled = math.compile(rhs);
    } catch {
      return;
    }
    const w = state.canvasSize.w,
      h = state.canvasSize.h;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = op.indexOf("<") >= 0 ? "#16a34a" : "#06b6d4";
    const rowStep = 4;
    for (let py = 0; py < h; py += rowStep) {
      ctx.beginPath();
      let spanOpen = false,
        startX = 0;
      for (let px = 0; px <= w; px += 4) {
        const xg = canvasToGraphX(px);
        let f;
        try {
          f = compiled.evaluate(Object.assign({ x: xg }, state.vars));
        } catch {
          f = NaN;
        }
        const fPx = Number.isFinite(f) ? graphToCanvasY(f) : NaN;
        let cond = false;
        if (Number.isFinite(fPx)) {
          if (op === "<") cond = py > fPx;
          else if (op === "<=") cond = py >= fPx - 1e-6;
          else if (op === ">") cond = py < fPx;
          else if (op === ">=") cond = py <= fPx + 1e-6;
        }
        if (cond && !spanOpen) {
          spanOpen = true;
          startX = px;
        }
        if (!cond && spanOpen) {
          ctx.rect(startX, py, px - startX, rowStep);
          spanOpen = false;
        }
      }
      if (spanOpen) ctx.rect(startX, py, w - startX, rowStep);
      ctx.fill();
      ctx.closePath();
    }
    ctx.restore();
    plotCompiled(compiled, "#10b981", Number($("strokePx")?.value || 2));
  }

  function drawAll() {
    if (state.show3D) return;
    clearCanvas();
    drawGrid();
    state.functions.forEach((f, i) => {
      try {
        plotCompiled(
          f.compiled,
          f.color || pickColor(i),
          Number($("strokePx")?.value || 2)
        );
      } catch (e) {}
    });
    if (state.inequalityMode && $("ineqInput") && $("ineqInput").value.trim()) {
      shadeInequality($("ineqInput").value.trim());
    }
    if (state.derivativeOverlay) {
      state.functions.forEach((f) => {
        try {
          const dnode = math.derivative(f.expr, "x");
          plotCompiled(math.compile(dnode.toString()), "#ef4444", 1.5);
        } catch {
          const numeric = {
            evaluate: ({ x }) => {
              const h = 1e-6;
              try {
                const y1 = f.compiled.evaluate(
                  Object.assign({ x: x + h }, state.vars)
                );
                const y0 = f.compiled.evaluate(
                  Object.assign({ x: x - h }, state.vars)
                );
                return (y1 - y0) / (2 * h);
              } catch {
                return NaN;
              }
            },
          };
          plotCompiled(numeric, "#ef4444", 1.5);
        }
      });
    }
    if (state.secondDerivative) {
      state.functions.forEach((f) => {
        try {
          const d2 = math.derivative(math.derivative(f.expr, "x"), "x");
          plotCompiled(math.compile(d2.toString()), "#7c3aed", 1.2);
        } catch {
          const numeric2 = {
            evaluate: ({ x }) => {
              const h = 1e-3;
              try {
                const y1 = f.compiled.evaluate(
                  Object.assign({ x: x + h }, state.vars)
                );
                const y0 = f.compiled.evaluate(
                  Object.assign({ x: x }, state.vars)
                );
                const ym1 = f.compiled.evaluate(
                  Object.assign({ x: x - h }, state.vars)
                );
                return (y1 - 2 * y0 + ym1) / (h * h);
              } catch {
                return NaN;
              }
            },
          };
          plotCompiled(numeric2, "#7c3aed", 1.2);
        }
      });
    }
  }

  let dragging = false,
    lastPos = null;
  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastPos = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = "grabbing";
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    lastPos = null;
    canvas.style.cursor = "default";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    state.offsetX += e.clientX - lastPos.x;
    state.offsetY += e.clientY - lastPos.y;
    lastPos = { x: e.clientX, y: e.clientY };
    drawAll();
  });

  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? 0.9 : 1.1;
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left,
        my = ev.clientY - rect.top;
      const gxBefore = canvasToGraphX(mx),
        gyBefore = canvasToGraphY(my);
      state.zoom *= delta;
      state.zoom = clamp(state.zoom, 0.2, 12);
      const gxAfter = canvasToGraphX(mx),
        gyAfter = canvasToGraphY(my);
      state.offsetX += graphToCanvasX(gxAfter) - graphToCanvasX(gxBefore);
      state.offsetY += graphToCanvasY(gyAfter) - graphToCanvasY(gyBefore);
      $("zoomDisplay") &&
        ($("zoomDisplay").innerText = state.zoom.toFixed(2) + "x");
      drawAll();
    },
    { passive: false }
  );

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r") {
      state.zoom = 1;
      state.offsetX = 0;
      state.offsetY = 0;
      $("zoomDisplay") && ($("zoomDisplay").innerText = "1x");
      drawAll();
    }
  });

  function addHistory(txt) {
    const h = $("history");
    if (!h) return;
    const d = document.createElement("div");
    const ts = new Date().toLocaleTimeString();
    d.textContent = ts + " · " + txt;
    h.insertBefore(d, h.firstChild);
    while (h.children.length > state.historyLimit) h.removeChild(h.lastChild);
  }

  function refreshStored() {
    const box = $("storedList");
    if (!box) return;
    box.innerHTML = "";
    state.stored.forEach((s, idx) => {
      const row = document.createElement("div");
      row.className = "row";
      row.style.justifyContent = "space-between";
      const left = document.createElement("div");
      left.className = "row";
      const dot = document.createElement("span");
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.display = "inline-block";
      dot.style.borderRadius = "999px";
      dot.style.background = s.color || pickColor(idx);
      dot.style.marginRight = "8px";
      const label = document.createElement("span");
      label.className = "mono";
      label.textContent = (s.label ? "[" + s.label + "] " : "") + s.expr;
      left.appendChild(dot);
      left.appendChild(label);
      const right = document.createElement("div");
      right.className = "row";
      const plotBtn = document.createElement("button");
      plotBtn.className = "secondary";
      plotBtn.textContent = "Plot";
      plotBtn.onclick = () => {
        state.functions.push(s);
        drawAll();
        addHistory("plot stored: " + s.expr);
      };
      const delBtn = document.createElement("button");
      delBtn.className = "ghost";
      delBtn.textContent = "Del";
      delBtn.onclick = () => {
        state.stored = state.stored.filter((x) => x !== s);
        state.functions = state.functions.filter((x) => x !== s);
        refreshStored();
        drawAll();
      };
      right.appendChild(plotBtn);
      right.appendChild(delBtn);
      row.appendChild(left);
      row.appendChild(right);
      box.appendChild(row);
    });
  }

  function integrateNumeric(exprStr, a, b, steps = 2000) {
    const fn = math.compile(exprStr);
    let sum = 0;
    const dx = (b - a) / steps;
    for (let i = 0; i <= steps; i++) {
      const x = a + i * dx;
      let y = 0;
      try {
        y = fn.evaluate(Object.assign({ x }, state.vars));
        if (!isFinite(y)) y = 0;
      } catch {
        y = 0;
      }
      const coeff = i === 0 || i === steps ? 1 : i % 2 === 0 ? 2 : 4;
      sum += coeff * y;
    }
    return (dx / 3) * sum;
  }

  function limitNumeric(exprStr, point, dir = 0) {
    const fn = math.compile(exprStr);
    const h = Math.max(1e-9, Math.abs(point) * 1e-6 || 1e-6);
    try {
      if (dir === -1)
        return fn.evaluate(Object.assign({ x: point - h }, state.vars));
      if (dir === 1)
        return fn.evaluate(Object.assign({ x: point + h }, state.vars));
      return (
        0.5 *
        (fn.evaluate(Object.assign({ x: point - h }, state.vars)) +
          fn.evaluate(Object.assign({ x: point + h }, state.vars)))
      );
    } catch {
      return NaN;
    }
  }

  function findRoots(exprStr, range = [-50, 50], step = 0.5) {
    const fn = math.compile(exprStr);
    const roots = [];
    let prevX = range[0];
    let prevY = NaN;
    try {
      prevY = fn.evaluate(Object.assign({ x: prevX }, state.vars));
    } catch {
      prevY = NaN;
    }
    for (let x = range[0] + step; x <= range[1] + 1e-9; x += step) {
      let y = NaN;
      try {
        y = fn.evaluate(Object.assign({ x }, state.vars));
      } catch {
        y = NaN;
      }
      if (isFinite(prevY) && isFinite(y) && Math.abs(y) < 1e-14) roots.push(x);
      if (isFinite(prevY) && isFinite(y) && prevY * y < 0) {
        let a = prevX,
          b = x,
          fa = prevY,
          fb = y;
        for (let i = 0; i < 50; i++) {
          const m = 0.5 * (a + b);
          let fm;
          try {
            fm = fn.evaluate(Object.assign({ x: m }, state.vars));
          } catch {
            break;
          }
          if (!isFinite(fm)) break;
          if (Math.abs(fm) < 1e-12) {
            a = m;
            b = m;
            break;
          }
          if (fa * fm < 0) {
            b = m;
            fb = fm;
          } else {
            a = m;
            fa = fm;
          }
          if (Math.abs(b - a) < 1e-12) break;
        }
        roots.push(0.5 * (a + b));
      }
      prevX = x;
      prevY = y;
    }
    const uniq = [];
    for (const r of roots) {
      if (!uniq.some((u) => Math.abs(u - r) < 1e-6)) uniq.push(r);
    }
    return uniq;
  }

  function findIntersections() {
    if (state.functions.length < 2) return [];
    const f1 = state.functions[state.functions.length - 2].expr;
    const f2 = state.functions[state.functions.length - 1].expr;
    const diff = `(${f1}) - (${f2})`;
    return findRoots(diff, [-50, 50], 0.2);
  }

  $("btnPlot")?.addEventListener("click", () => {
    const v = $("fnInput").value.trim();
    if (!v) return alert("Enter f(x)");
    try {
      const compiled = math.compile(v);
      const entry = {
        expr: v,
        compiled,
        color: pickColor(state.functions.length),
        label: $("storeName")?.value.trim() || "",
      };
      state.functions.push(entry);
      drawAll();
      analyzeAndShow(v);
      addHistory("plot: " + v);
    } catch (err) {
      alert(
        "Invalid expression: " +
          (err && err.message ? err.message : String(err))
      );
    }
  });

  $("btnPlotDeriv")?.addEventListener("click", () => {
    state.derivativeOverlay = !state.derivativeOverlay;
    drawAll();
    addHistory("toggle derivative");
  });
  $("btnToggleIneq")?.addEventListener("click", () => {
    state.inequalityMode = !state.inequalityMode;
    drawAll();
    addHistory("toggle inequality");
  });
  $("btnReset")?.addEventListener("click", () => {
    state.zoom = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    $("zoomDisplay") && ($("zoomDisplay").innerText = "1x");
    drawAll();
    addHistory("reset view");
  });
  $("btnSavePNG")?.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "graph2d.png";
    a.click();
    addHistory("export png");
  });

  $("btn3D")?.addEventListener("click", () => {
    const f = $("fn3D").value.trim();
    if (!f) return alert("enter 3D function (z = f(x,y))");
    let compiled;
    try {
      compiled = math.compile(f);
    } catch (err) {
      $(
        "analysisContent"
      ).innerHTML = `<pre>3D compile error: ${err.message}</pre>`;
      return;
    }
    const xsMin = +$("x3dMin").value,
      xsMax = +$("x3dMax").value,
      ysMin = +$("y3dMin").value,
      ysMax = +$("y3dMax").value;
    let steps = Math.max(
      10,
      Math.min(200, Math.floor(+$("steps3d").value) || 60)
    );
    if (!(xsMax > xsMin && ysMax > ysMin)) {
      $("analysisContent").innerHTML = `<pre>Invalid 3D domain ranges</pre>`;
      return;
    }
    const dx = (xsMax - xsMin) / steps,
      dy = (ysMax - ysMin) / steps;
    const xs = math.range(xsMin, xsMax, dx).toArray();
    const ys = math.range(ysMin, ysMax, dy).toArray();
    const z = [];
    for (let i = 0; i < xs.length; i++) {
      z[i] = [];
      for (let j = 0; j < ys.length; j++) {
        try {
          const v = compiled.evaluate(
            Object.assign({ x: xs[i], y: ys[j] }, state.vars)
          );
          z[i][j] = Number.isFinite(v) ? v : null;
        } catch {
          z[i][j] = null;
        }
      }
    }
    const plotEl = $("plot3dStandalone");
    if (!plotEl) {
      $("analysisContent").innerHTML = `<pre>3D plot container not found</pre>`;
      return;
    }
    Plotly.newPlot(
      plotEl,
      [{ x: xs, y: ys, z: z, type: "surface", colorscale: "Viridis" }],
      { margin: { t: 30, b: 30, l: 30, r: 30 } }
    ).then(() => setTimeout(() => Plotly.Plots.resize(plotEl), 80));
    addHistory(`3D: ${f}`);
  });

  function analyzeAndShow(expr) {
    const analysis = [];
    try {
      const y0 = math
        .compile(expr)
        .evaluate(Object.assign({ x: 0 }, state.vars));
      analysis.push("f(0) = " + (isFinite(y0) ? y0 : "undefined"));
    } catch {}
    try {
      const roots = findRoots(expr, [-50, 50], 0.5)
        .slice(0, 20)
        .map((r) => r.toFixed(6));
      analysis.push(
        "approx roots: " + (roots.length ? roots.join(", ") : "none found")
      );
    } catch {}
    try {
      const deriv = (() => {
        try {
          return math.derivative(expr, "x").toString();
        } catch {
          return "n/a";
        }
      })();
      analysis.push("symbolic derivative: " + deriv);
    } catch {}
    $("analysisContent") &&
      ($("analysisContent").innerHTML =
        "<pre class='mono'>" + analysis.join("\n") + "</pre>");
  }

  document.querySelectorAll("#tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("#tabs .tab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document
        .querySelectorAll(".view")
        .forEach((v) => v.classList.remove("active"));
      const view = $(btn.dataset.view);
      if (view) view.classList.add("active");
      if (btn.dataset.view === "v-graph2d") resizeCanvas();
    });
  });

  $("pixelsPerUnit") && ($("pixelsPerUnit").value = state.scale);
  $("strokePx") && ($("strokePx").value = 2);

  window.ACalc = { state, drawAll, findRoots, addHistory };

  $("btnStore")?.addEventListener("click", () => {
    const v = $("fnInput").value.trim();
    const label = $("storeName")?.value.trim() || "";
    if (!v) return alert("Enter expression to store");
    try {
      const compiled = math.compile(v);
      try {
        compiled.evaluate(Object.assign({ x: 0 }, state.vars));
      } catch {}
      const existing = state.stored.find((s) => s.expr === v);
      if (existing) {
        existing.compiled = compiled;
        if (label) existing.label = label;
        $("analysisContent").innerHTML = `<pre>Updated stored: ${
          existing.label ? "[" + existing.label + "] " : ""
        }${v}</pre>`;
        addHistory("store updated: " + (existing.label || "") + v);
      } else {
        const entry = {
          expr: v,
          compiled,
          color: pickColor(state.stored.length),
          label,
        };
        state.stored.push(entry);
        $("analysisContent").innerHTML = `<pre>Stored: ${
          label ? "[" + label + "] " : ""
        }${v}</pre>`;
        addHistory("stored: " + (label ? "[" + label + "] " : "") + v);
      }
      refreshStored();
    } catch (err) {
      $("analysisContent").innerHTML = `<pre>Store failed: ${
        err && err.message ? err.message : String(err)
      }</pre>`;
    }
  });

  $("btnClearStored")?.addEventListener("click", () => {
    if (!confirm("Clear all stored functions?")) return;
    const removePlotted = confirm(
      "Also remove plotted functions that were stored? OK=remove plotted ones"
    );
    if (removePlotted && state.stored.length) {
      const storedExprs = new Set(state.stored.map((s) => s.expr));
      state.functions = state.functions.filter((f) => !storedExprs.has(f.expr));
    }
    state.stored = [];
    refreshStored();
    drawAll();
    addHistory(
      "cleared stored list" +
        (removePlotted ? " (removed plotted matches)" : "")
    );
  });

  (function installAlgebraHandlers() {
    $("btnSimplify")?.addEventListener("click", () => {
      const v = $("algExpr").value.trim();
      if (!v) return alert("Enter expression to simplify");
      try {
        const out = math.simplify(v).toString();
        $("algOut").innerHTML = `<pre>${out}</pre>`;
        addHistory(`simplify: ${v} -> ${out}`);
      } catch (e) {
        try {
          const res = Algebrite.run(`simplify(${v})`);
          $("algOut").innerHTML = `<pre>${res}</pre>`;
          addHistory(`simplify(Algebrite): ${v}`);
        } catch (err) {
          $("algOut").innerHTML = `<pre>Simplify failed: ${
            err && err.message ? err.message : err
          }</pre>`;
        }
      }
    });

    $("btnFactor")?.addEventListener("click", () => {
      const v = $("algExpr").value.trim();
      if (!v) return alert("Enter expression to factor");
      try {
        const res = Algebrite.run(`factor(${v})`);
        $("algOut").innerHTML = `<pre>${res}</pre>`;
        addHistory(`factor: ${v}`);
      } catch (err) {
        $("algOut").innerHTML = `<pre>Factor failed: ${
          err && err.message ? err.message : err
        }</pre>`;
      }
    });

    $("btnSolve")?.addEventListener("click", () => {
      const v = $("algExpr").value.trim();
      if (!v) return alert("Enter expression or equation to solve");
      let exprForNumeric = v;
      if (v.includes("=")) {
        const parts = v.split("=");
        exprForNumeric = `(${parts[0]}) - (${parts.slice(1).join("=")})`;
      }
      try {
        const ar = Algebrite.run(`roots(${exprForNumeric})`);
        if (ar && ar !== "[]") {
          $("algOut").innerHTML = `<pre>Algebrite roots:\n${ar}</pre>`;
          addHistory(`solve(Algebrite): ${v}`);
          return;
        }
      } catch {}
      try {
        const roots = findRoots(exprForNumeric, [-100, 100], 0.25).map((r) =>
          Number(r).toFixed(8)
        );
        $("algOut").innerHTML = `<pre>Numeric roots ≈ ${
          roots.length ? roots.join(", ") : "none found"
        }</pre>`;
        addHistory(`solve(numeric): ${v} -> ${roots.join(",")}`);
      } catch (err) {
        $("algOut").innerHTML = `<pre>Solve failed: ${
          err && err.message ? err.message : err
        }</pre>`;
      }
    });

    $("btnSeries")?.addEventListener("click", () => {
      const v = $("algExpr").value.trim();
      const n = Math.max(1, parseInt($("seriesOrder")?.value || "6", 10));
      if (!v) return alert("Enter expression for series expansion");
      try {
        const cmd = `taylor(${v}, x, 0, ${n})`;
        const res = Algebrite.run(cmd);
        $("algOut").innerHTML = `<pre>${res}</pre>`;
        addHistory(`series: ${v} (order ${n})`);
      } catch (err) {
        $("algOut").innerHTML = `<pre>Series expansion failed: ${
          err && err.message ? err.message : err
        }</pre>`;
      }
    });

    $("btnSolveSystem")?.addEventListener("click", () => {
      const raw = $("sysInput").value.trim();
      if (!raw) return alert("Enter system equations, one per line");
      const lines = raw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!lines.length) return alert("No equations provided");
      let vars = $("sysVars").value.trim();
      if (!vars) {
        const set = new Set();
        lines.join(" ").replace(/[a-zA-Z_]\w*/g, (m) => {
          if (!/^(e|pi|sin|cos|tan|log|exp|abs)$/.test(m)) set.add(m);
        });
        vars = [...set].slice(0, 6).join(",");
      }
      try {
        const eqList = "[" + lines.join(",") + "]";
        const varList = "[" + vars + "]";
        const cmd = `solve(${eqList}, ${varList})`;
        const res = Algebrite.run(cmd);
        $("sysOut").innerHTML = `<pre>${res}</pre>`;
        addHistory(`solve system: ${lines.length} eqns`);
      } catch (err) {
        $("sysOut").innerHTML = `<pre>System solve failed: ${
          err && err.message ? err.message : err
        }</pre>`;
      }
    });

    $("btnGraphIneq")?.addEventListener("click", () => {
      const v = $("ineqInput").value.trim();
      if (!v) return alert("Enter inequality like 'y <= sin(x)'");
      state.inequalityMode = true;
      drawAll();
      $("analysisContent").innerHTML = `<pre>Inequality plotted: ${v}</pre>`;
      addHistory(`graph inequality: ${v}`);
    });
  })();

  $("btnDeriv")?.addEventListener("click", () => {
    const v = $("calcExpr").value.trim();
    if (!v) return alert("Enter expression for derivative");
    try {
      const d = math.derivative(v, "x").toString();
      $("calcOut").innerHTML = `<pre>f'(x) = ${d}</pre>`;
      addHistory(`derivative: ${v}`);
    } catch (e) {
      try {
        const res = Algebrite.run(`d(${v}, x)`);
        $("calcOut").innerHTML = `<pre>${res}</pre>`;
        addHistory(`derivative(Algebrite): ${v}`);
      } catch (err) {
        $("calcOut").innerHTML = `<pre>Derivative failed: ${
          err && err.message ? err.message : err
        }</pre>`;
      }
    }
  });

  $("btnIntegral")?.addEventListener("click", () => {
    const v = $("calcExpr").value.trim();
    if (!v) return alert("Enter expression for integral");
    try {
      const I = Algebrite.run(`integral(${v}, x)`);
      $("calcOut").innerHTML = `<pre>∫ ${v} dx = ${I} + C</pre>`;
      addHistory(`integral: ${v}`);
    } catch (e) {
      $("calcOut").innerHTML = `<pre>Symbolic integral failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("btnLimits")?.addEventListener("click", () => {
    const v = $("calcExpr").value.trim();
    if (!v) return alert("Enter expression for limit");
    const a = $("limA")?.value.trim();
    const dir = +$("limDir")?.value;
    try {
      const res = Algebrite.run(`limit(${v}, x, ${a})`);
      $("calcOut").innerHTML = `<pre>limₓ→${a} ${v} = ${res}</pre>`;
      addHistory(`limit: ${v} at ${a}`);
    } catch {
      const num = limitNumeric(v, parseFloat(a), dir);
      $("calcOut").innerHTML = `<pre>Numeric approx: ${num}</pre>`;
    }
  });

  $("btnDefInt")?.addEventListener("click", () => {
    const v = $("calcExpr").value.trim();
    const a = +$("defA")?.value,
      b = +$("defB")?.value;
    if (!v) return alert("Enter function for definite integral");
    if (!isFinite(a) || !isFinite(b)) return alert("Invalid limits");
    try {
      const val = integrateNumeric(v, a, b, 3000);
      $("calcOut").innerHTML = `<pre>∫[${a},${b}] ${v} dx ≈ ${val}</pre>`;
      addHistory(`defint ${v} [${a},${b}] ≈ ${val}`);
    } catch (e) {
      $("calcOut").innerHTML = `<pre>Integral failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("btnGrad")?.addEventListener("click", () => {
    const f = $("calcFxy")?.value.trim();
    if (!f) return alert("Enter f(x,y)");
    try {
      const dx = math.derivative(f, "x").toString(),
        dy = math.derivative(f, "y").toString();
      $("calcMultiOut").innerHTML = `<pre>∇f = ⟨${dx}, ${dy}⟩</pre>`;
      addHistory(`grad: ${f}`);
    } catch (e) {
      $("calcMultiOut").innerHTML = `<pre>Gradient failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("btnPartial")?.addEventListener("click", () => {
    const f = $("calcFxy")?.value.trim();
    if (!f) return alert("Enter f(x,y)");
    try {
      const dx = math.derivative(f, "x").toString(),
        dy = math.derivative(f, "y").toString();
      $("calcMultiOut").innerHTML = `<pre>∂f/∂x = ${dx}\n∂f/∂y = ${dy}</pre>`;
    } catch (e) {
      $("calcMultiOut").innerHTML = `<pre>Partial derivatives failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("btnDoubleInt")?.addEventListener("click", () => {
    const f = $("calcFxy")?.value.trim();
    if (!f) return alert("Enter f(x,y)");
    try {
      const fx = math.compile(f);
      const x1 = +$("mx1")?.value,
        x2 = +$("mx2")?.value,
        y1 = +$("my1")?.value,
        y2 = +$("my2")?.value;
      const nx = 80,
        ny = 80;
      const dx = (x2 - x1) / nx,
        dy = (y2 - y1) / ny;
      let s = 0;
      for (let i = 0; i <= nx; i++) {
        const x = x1 + i * dx;
        for (let j = 0; j <= ny; j++) {
          const y = y1 + j * dy;
          let w = 1;
          if (i === 0 || i === nx) w *= 0.5;
          if (j === 0 || j === ny) w *= 0.5;
          let val;
          try {
            val = fx.evaluate(Object.assign({ x, y }, state.vars));
            if (!isFinite(val)) val = 0;
          } catch {
            val = 0;
          }
          s += val * w;
        }
      }
      const val = s * dx * dy;
      $("calcMultiOut").innerHTML = `<pre>∬ ≈ ${val}</pre>`;
      addHistory(`double integral approx: ${val}`);
    } catch (e) {
      $("calcMultiOut").innerHTML = `<pre>Double integral failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  const linearHelpers = {
    clone: (A) => A.map((r) => r.slice()),
    rref(Ain) {
      const A = Ain.map((r) => r.map((x) => +x));
      const m = A.length,
        n = A[0].length;
      let lead = 0;
      for (let r = 0; r < m; r++) {
        if (lead >= n) break;
        let i = r;
        while (i < m && Math.abs(A[i][lead]) < 1e-12) i++;
        if (i === m) {
          lead++;
          r--;
          continue;
        }
        [A[i], A[r]] = [A[r], A[i]];
        const lv = A[r][lead];
        for (let j = 0; j < n; j++) A[r][j] /= lv;
        for (let i2 = 0; i2 < m; i2++) {
          if (i2 === r) continue;
          const lv2 = A[i2][lead];
          for (let j = 0; j < n; j++) A[i2][j] -= lv2 * A[r][j];
        }
        lead++;
      }
      let rank = 0;
      for (let i = 0; i < m; i++)
        if (A[i].some((v) => Math.abs(v) > 1e-10)) rank++;
      return { mat: A, rank };
    },
    lu(Ain) {
      const A = Ain.map((r) => r.slice());
      const n = A.length;
      const L = math.zeros(n, n)._data;
      const U = math.zeros(n, n)._data;
      for (let i = 0; i < n; i++) {
        for (let k = i; k < n; k++) {
          let sum = 0;
          for (let j = 0; j < i; j++) sum += L[i][j] * U[j][k];
          U[i][k] = A[i][k] - sum;
        }
        for (let k = i; k < n; k++) {
          if (i === k) L[i][i] = 1;
          else {
            let sum = 0;
            for (let j = 0; j < i; j++) sum += L[k][j] * U[j][i];
            L[k][i] = (A[k][i] - sum) / (U[i][i] || 1e-12);
          }
        }
      }
      return { L, U };
    },
    qr(Ain) {
      const A = Ain.map((r) => r.slice());
      const m = A.length,
        n = A[0].length;
      let Q = math.zeros(m, n)._data,
        R = math.zeros(n, n)._data;
      for (let k = 0; k < n; k++) {
        let v = A.map((row) => row[k]);
        for (let j = 0; j < k; j++) {
          const qj = Q.map((row) => row[j]);
          const rkj = math.dot(v, qj);
          R[j][k] = rkj;
          v = math.subtract(v, math.multiply(rkj, qj));
        }
        const norm = math.norm(v);
        R[k][k] = norm;
        if (norm === 0) continue;
        const qk = math.divide(v, norm);
        for (let i = 0; i < m; i++) Q[i][k] = qk[i];
      }
      return { Q, R };
    },
    eigQR(Ain, iter = 60) {
      let Ak = Ain.map((r) => r.slice());
      for (let t = 0; t < iter; t++) {
        const { Q, R } = this.qr(Ak);
        Ak = math.multiply(R, Q);
      }
      const values = Ak.map((r, i) => Ak[i][i]);
      return { values };
    },
  };

  $("matDet")?.addEventListener("click", () => {
    try {
      const A = JSON.parse($("matrixInput").value);
      const det = math.det(A);
      $("linOut").innerHTML = `<pre>det = ${det}</pre>`;
      addHistory("matrix det");
    } catch (e) {
      $("linOut").innerHTML = `<pre>det failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("matInv")?.addEventListener("click", () => {
    try {
      const A = JSON.parse($("matrixInput").value);
      const inv = math.inv(A);
      $("linOut").innerHTML = `<pre>inv = ${JSON.stringify(inv)}</pre>`;
      addHistory("matrix inv");
    } catch (e) {
      $("linOut").innerHTML = `<pre>inv failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("matRank")?.addEventListener("click", () => {
    try {
      const A = JSON.parse($("matrixInput").value);
      const rank = math.rank ? math.rank(A) : linearHelpers.rref(A).rank;
      $("linOut").innerHTML = `<pre>rank = ${rank}</pre>`;
      addHistory("matrix rank");
    } catch (e) {
      $("linOut").innerHTML = `<pre>rank failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("matRREF")?.addEventListener("click", () => {
    try {
      const A = JSON.parse($("matrixInput").value);
      const r = linearHelpers.rref(A);
      $("linOut").innerHTML = `<pre>RREF = ${JSON.stringify(r.mat)}\nrank=${
        r.rank
      }</pre>`;
      addHistory("matrix rref");
    } catch (e) {
      $("linOut").innerHTML = `<pre>RREF failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("matMul")?.addEventListener("click", () => {
    try {
      const A = JSON.parse($("matrixInput").value);
      const C = math.multiply(A, A);
      $("linOut").innerHTML = `<pre>A×A = ${JSON.stringify(C)}</pre>`;
      addHistory("matrix mul");
    } catch (e) {
      $("linOut").innerHTML = `<pre>mul failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("matAdd")?.addEventListener("click", () => {
    try {
      const A = JSON.parse($("matrixInput").value);
      const C = math.add(A, A);
      $("linOut").innerHTML = `<pre>A+A = ${JSON.stringify(C)}</pre>`;
      addHistory("matrix add");
    } catch (e) {
      $("linOut").innerHTML = `<pre>add failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("matLU")?.addEventListener("click", () => {
    try {
      const A = JSON.parse($("matrixInput").value);
      const { L, U } = linearHelpers.lu(A);
      $("linOut").innerHTML = `<pre>L=${JSON.stringify(L)}\nU=${JSON.stringify(
        U
      )}</pre>`;
      addHistory("matrix LU");
    } catch (e) {
      $("linOut").innerHTML = `<pre>LU failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("matQR")?.addEventListener("click", () => {
    try {
      const A = JSON.parse($("matrixInput").value);
      const { Q, R } = linearHelpers.qr(A);
      $("linOut").innerHTML = `<pre>Q=${JSON.stringify(Q)}\nR=${JSON.stringify(
        R
      )}</pre>`;
      addHistory("matrix QR");
    } catch (e) {
      $("linOut").innerHTML = `<pre>QR failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("matEig")?.addEventListener("click", () => {
    try {
      const A = JSON.parse($("matrixInput").value);
      const eig = linearHelpers.eigQR(A, 80);
      $("linOut").innerHTML = `<pre>eigenapprox values = ${JSON.stringify(
        eig.values
      )}</pre>`;
      addHistory("matrix eig");
    } catch (e) {
      $("linOut").innerHTML = `<pre>eig failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("vecDot")?.addEventListener("click", () => {
    try {
      const a = JSON.parse($("vecA").value),
        b = JSON.parse($("vecB").value);
      $("vecOut").innerHTML = `<pre>dot = ${math.dot(a, b)}</pre>`;
      addHistory("vec dot");
    } catch (e) {
      $("vecOut").innerHTML = `<pre>dot failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });
  $("vecCross")?.addEventListener("click", () => {
    try {
      const a = JSON.parse($("vecA").value),
        b = JSON.parse($("vecB").value);
      $("vecOut").innerHTML = `<pre>cross = ${JSON.stringify(
        math.cross(a, b)
      )}</pre>`;
      addHistory("vec cross");
    } catch (e) {
      $("vecOut").innerHTML = `<pre>cross failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });
  $("vecNorm")?.addEventListener("click", () => {
    try {
      const a = JSON.parse($("vecA").value);
      $("vecOut").innerHTML = `<pre>‖a‖ = ${math.norm(a)}</pre>`;
      addHistory("vec norm");
    } catch (e) {
      $("vecOut").innerHTML = `<pre>norm failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("btnStats")?.addEventListener("click", () => {
    try {
      const arr = ($("statsInput").value || "")
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => isFinite(n));
      if (!arr.length) return alert("enter comma-separated numeric data");
      const mean = math.mean(arr),
        median = math.median(arr),
        sd = math.std(arr),
        min = math.min(arr),
        max = math.max(arr);
      $(
        "statsOut"
      ).innerHTML = `<pre>n=${arr.length}\nmean=${mean}\nmedian=${median}\nstd=${sd}\nmin=${min}\nmax=${max}</pre>`;
      addHistory("stats computed");
    } catch (e) {
      $("statsOut").innerHTML = `<pre>stats failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("btnHistogram")?.addEventListener("click", () => {
    try {
      const arr = ($("statsInput").value || "")
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => isFinite(n));
      if (!arr.length) return alert("enter data");
      Plotly.newPlot("regPlot", [{ x: arr, type: "histogram" }], {
        margin: { t: 10 },
      });
      addHistory("histogram");
    } catch (e) {
      alert("histogram failed: " + (e && e.message ? e.message : e));
    }
  });

  $("btnRegress")?.addEventListener("click", () => {
    try {
      const ys = ($("regY").value || "")
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => isFinite(n));
      if (!ys.length) return alert("enter y values");
      let xs = ($("regX").value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseFloat(s));
      if (!xs.length) xs = ys.map((_, i) => i);
      if (xs.length !== ys.length) return alert("x and y length mismatch");
      const deg = Math.max(
        1,
        Math.min(8, parseInt($("regDeg")?.value || "1", 10))
      );
      const V = ys.map((_, i) => {
        const row = [];
        for (let p = 0; p <= deg; p++) row.push(Math.pow(xs[i], p));
        return row;
      });
      const yvec = ys.map((v) => [v]);
      const VT = math.transpose(V);
      const A = math.multiply(VT, V);
      const b = math.multiply(VT, yvec);
      const coeffs = math.lusolve(A, b).map((r) => r[0]);
      const coeffArr = coeffs;
      const xPlot = math
        .range(
          Math.min(...xs),
          Math.max(...xs),
          (Math.max(...xs) - Math.min(...xs)) / 200
        )
        .toArray();
      const yFit = xPlot.map((xx) =>
        coeffArr.reduce((s, c, p) => s + c * Math.pow(xx, p), 0)
      );
      Plotly.newPlot(
        "regPlot",
        [
          { x: xs, y: ys, mode: "markers", name: "data" },
          { x: xPlot, y: yFit, mode: "lines", name: `deg ${deg} fit` },
        ],
        { margin: { t: 20 } }
      );
      $("regOut").innerHTML = `<pre>coeffs = [${coeffArr
        .map((c) => Number(c).toFixed(6))
        .join(", ")}]</pre>`;
      addHistory("regression fit");
    } catch (e) {
      $("regOut").innerHTML = `<pre>regression failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  function normPDF(x, mu, sigma) {
    const z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
  }
  function binomPMF(k, n, p) {
    return math.combinations(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }
  $("btnDist")?.addEventListener("click", () => {
    const type = $("distType")?.value;
    if (!type) return;
    const out = [];
    if (type === "normal") {
      let mu = parseFloat(prompt("μ", "0")),
        sigma = parseFloat(prompt("σ", "1"));
      if (!isFinite(mu) || !isFinite(sigma) || sigma <= 0)
        return alert("invalid params");
      const xs = math
        .range(mu - 4 * sigma, mu + 4 * sigma, (8 * sigma) / 200)
        .toArray();
      const ys = xs.map((x) => normPDF(x, mu, sigma));
      Plotly.newPlot("distPlot", [{ x: xs, y: ys, mode: "lines" }], {
        margin: { t: 20 },
      });
      $("distOut").innerHTML = `<pre>Normal(μ=${mu},σ=${sigma})</pre>`;
    } else if (type === "binomial") {
      const n = parseInt(prompt("n", "10"), 10),
        p = parseFloat(prompt("p", "0.5"));
      if (!isFinite(n) || !isFinite(p)) return alert("invalid");
      const ks = Array.from({ length: n + 1 }, (_, k) => k);
      const ps = ks.map((k) => binomPMF(k, n, p));
      Plotly.newPlot("distPlot", [{ x: ks, y: ps, type: "bar" }], {
        margin: { t: 20 },
      });
      $("distOut").innerHTML = `<pre>Binomial(n=${n}, p=${p})</pre>`;
    } else if (type === "poisson") {
      const lambda = parseFloat(prompt("λ", "3"));
      if (!isFinite(lambda)) return alert("invalid");
      const ks = Array.from(
        { length: Math.max(10, Math.ceil(lambda * 4)) },
        (_, k) => k
      );
      const ps = ks.map(
        (k) => (Math.exp(-lambda) * Math.pow(lambda, k)) / math.factorial(k)
      );
      Plotly.newPlot("distPlot", [{ x: ks, y: ps, type: "bar" }], {
        margin: { t: 20 },
      });
      $("distOut").innerHTML = `<pre>Poisson(λ=${lambda})</pre>`;
    } else if (type === "uniform") {
      const a = parseFloat(prompt("a", "0")),
        b = parseFloat(prompt("b", "1"));
      if (!isFinite(a) || !isFinite(b) || b <= a) return alert("invalid");
      const xs = math
        .range(a - (b - a) * 0.2, b + (b - a) * 0.2, (b - a) / 200)
        .toArray();
      const ys = xs.map((x) => (x >= a && x <= b ? 1 / (b - a) : 0));
      Plotly.newPlot("distPlot", [{ x: xs, y: ys, mode: "lines" }], {
        margin: { t: 20 },
      });
      $("distOut").innerHTML = `<pre>Uniform(${a},${b})</pre>`;
    }
    addHistory(`distribution: ${type}`);
  });

  function rk4(f, x0, y0, h, n) {
    const xs = [x0],
      ys = [y0];
    let x = x0,
      y = y0;
    for (let i = 0; i < n; i++) {
      const k1 = f(x, y);
      const k2 = f(x + 0.5 * h, y + 0.5 * h * k1);
      const k3 = f(x + 0.5 * h, y + 0.5 * h * k2);
      const k4 = f(x + h, y + h * k3);
      y = y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      x = x + h;
      xs.push(x);
      ys.push(y);
    }
    return { xs, ys };
  }

  $("btnODE")?.addEventListener("click", () => {
    try {
      const s = $("odeF").value.trim();
      if (!s) return alert("enter dy/dx = f(x,y)");
      const x0 = +$("odeX0")?.value,
        y0 = +$("odeY0")?.value;
      const h = parseFloat($("odeH")?.value) || 0.05,
        n = parseInt($("odeN")?.value || "200", 10);
      const compiled = math.compile(s);
      const f = (x, y) => {
        try {
          return compiled.evaluate(Object.assign({ x, y }, state.vars));
        } catch {
          return NaN;
        }
      };
      const res = rk4(f, x0, y0, h, n);
      Plotly.newPlot("odePlot", [{ x: res.xs, y: res.ys, mode: "lines" }], {
        margin: { t: 20 },
      });
      $("odeOut").innerHTML = `<pre>RK4 steps=${res.xs.length}</pre>`;
      addHistory("ODE RK4 solved");
    } catch (e) {
      $("odeOut").innerHTML = `<pre>ODE failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("btnClearAll")?.addEventListener("click", () => {
    if (!confirm("Clear all plotted functions?")) return;
    state.functions = [];
    drawAll();
    if ($("analysisContent"))
      $("analysisContent").innerHTML = "<em>cleared</em>";
    addHistory("cleared plots");
  });

  $("btnIntersections")?.addEventListener("click", () => {
    const pts = findIntersections();
    $("analysisContent") &&
      ($("analysisContent").innerHTML = `<pre>Intersections (approx):\n${
        pts.length ? pts.map((p) => p.toFixed(6)).join(", ") : "none"
      }</pre>`);
    addHistory("intersections");
  });

  $("btnRoots")?.addEventListener("click", () => {
    const v = $("fnInput").value.trim();
    if (!v) return alert("Enter f(x)");
    try {
      const r = findRoots(v, [-100, 100], 0.25).map((x) => +x.toFixed(8));
      $("analysisContent") &&
        ($("analysisContent").innerHTML = `<pre>Roots ≈ ${
          r.join(", ") || "none"
        }</pre>`);
      addHistory("roots");
    } catch (e) {
      $("analysisContent") &&
        ($("analysisContent").innerHTML = `<pre>Roots error: ${
          e && e.message ? e.message : e
        }</pre>`);
    }
  });

  $("btnTangent")?.addEventListener("click", () => {
    const v = $("fnInput").value.trim();
    if (!v) return alert("Enter f(x)");
    const x0 = parseFloat(prompt("x₀", "0"));
    if (isNaN(x0)) return;
    try {
      const f = math.compile(v);
      const h = 1e-5;
      const y0 = f.evaluate(Object.assign({ x: x0 }, state.vars));
      const slope =
        (f.evaluate(Object.assign({ x: x0 + h }, state.vars)) -
          f.evaluate(Object.assign({ x: x0 - h }, state.vars))) /
        (2 * h);
      const line = { evaluate: ({ x }) => y0 + slope * (x - x0) };
      plotCompiled(line, "#10b981", 1.5);
      addHistory(`tangent x0=${x0}`);
    } catch (e) {
      alert("tangent failed: " + (e && e.message ? e.message : e));
    }
  });

  document
    .querySelector("#v-graph2d #btnIntegral")
    ?.addEventListener("click", () => {
      const v = $("fnInput").value.trim();
      if (!v) return alert("Enter f(x)");
      const a = parseFloat(prompt("Lower a", "-1")),
        b = parseFloat(prompt("Upper b", "1"));
      if (isNaN(a) || isNaN(b)) return;
      try {
        const val = integrateNumeric(v, a, b, 2000);
        $("analysisContent") &&
          ($(
            "analysisContent"
          ).innerHTML = `<pre>∫ ${v} dx from ${a} to ${b} ≈ ${val}</pre>`);
        addHistory(`defint: ${v} [${a},${b}] ≈ ${val}`);
      } catch {
        alert("integration failed");
      }
    });

  $("btnApplySettings")?.addEventListener("click", () => {
    state.scale = +$("pixelsPerUnit")?.value || state.scale;
    drawAll();
    addHistory("settings applied");
  });

  $("btnContour")?.addEventListener("click", () => {
    const f = $("contourFn")?.value.trim();
    if (!f) return alert("enter contour f(x,y)");
    try {
      const compiled = math.compile(f);
      const xs = math.range(-3, 3, 0.12).toArray();
      const ys = xs.slice();
      const z = [];
      for (let i = 0; i < xs.length; i++) {
        z[i] = [];
        for (let j = 0; j < ys.length; j++) {
          try {
            const v = compiled.evaluate(
              Object.assign({ x: xs[i], y: ys[j] }, state.vars)
            );
            z[i][j] = Number.isFinite(v) ? v : null;
          } catch {
            z[i][j] = null;
          }
        }
      }
      Plotly.newPlot("plot2dSecondary", [{ z, x: xs, y: ys, type: "contour" }]);
      addHistory("contour");
    } catch (e) {
      alert("contour failed: " + (e && e.message ? e.message : e));
    }
  });

  $("btnVectorField")?.addEventListener("click", () => {
    const fx = $("vecFieldFx")?.value.trim(),
      fy = $("vecFieldFy")?.value.trim();
    if (!fx || !fy) return alert("enter both components");
    try {
      const Fx = math.compile(fx),
        Fy = math.compile(fy);
      const xs = math.range(-3, 3, 0.6).toArray();
      const ys = xs.slice();
      const xq = [],
        yq = [],
        u = [],
        v = [];
      for (const x of xs)
        for (const y of ys) {
          try {
            u.push(Fx.evaluate(Object.assign({ x, y }, state.vars)));
            v.push(Fy.evaluate(Object.assign({ x, y }, state.vars)));
            xq.push(x);
            yq.push(y);
          } catch {
            u.push(0);
            v.push(0);
            xq.push(x);
            yq.push(y);
          }
        }
      Plotly.newPlot(
        "plot2dSecondary",
        [{ x: xq, y: yq, mode: "markers", marker: { size: 3 } }],
        { showlegend: false }
      );
      addHistory("vector field");
    } catch (e) {
      alert("vector field failed: " + (e && e.message ? e.message : e));
    }
  });

  $("btnExportHistory")?.addEventListener("click", () => {
    const h = $("history");
    if (!h) return alert("no history");
    const arr = Array.from(h.children).map((c) => c.textContent);
    const a = document.createElement("a");
    a.href =
      "data:application/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(arr, null, 2));
    a.download = "history.json";
    a.click();
    addHistory("export history");
  });
  $("btnClearHistory")?.addEventListener("click", () => {
    if (!confirm("Clear history?")) return;
    const h = $("history");
    if (h) h.innerHTML = "";
    addHistory("cleared history");
  });

  $("btnMemStore")?.addEventListener("click", () => {
    const name = $("memName")?.value.trim(),
      value = $("memValue")?.value.trim();
    if (!name) return alert("enter name");
    if (!value) return alert("enter value");
    try {
      const val = math.compile(value).evaluate(Object.assign({}, state.vars));
      state.vars[name] = val;
      $("memOut").innerHTML = `<pre>${name} = ${val}</pre>`;
      addHistory(`mem store ${name}`);
    } catch (e) {
      $("memOut").innerHTML = `<pre>mem store failed: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("btnMemRecall")?.addEventListener("click", () => {
    const name = $("memQuery")?.value.trim();
    if (!name) return alert("enter name");
    if (name in state.vars) {
      $("memOut").innerHTML = `<pre>${name} = ${state.vars[name]}</pre>`;
    } else $("memOut").innerHTML = `<pre>not found</pre>`;
  });

  $("btnMemClear")?.addEventListener("click", () => {
    if (!confirm("Clear all memory variables?")) return;
    state.vars = {};
    $("memOut").innerHTML = `<pre>cleared</pre>`;
    addHistory("mem cleared");
  });

  $("btnClearAll") && refreshStored();
  drawAll();

  $("btnRunScript")?.addEventListener("click", () => {
    const code = $("scriptArea")?.value || "";
    if (!code) return alert("write a script");
    const sandbox = {
      math,
      Algebrite,
      state,
      plot: (xFun) => {
        if (typeof xFun === "string") {
          try {
            const compiled = math.compile(xFun);
            state.functions.push({
              expr: xFun,
              compiled,
              color: pickColor(state.functions.length),
            });
            drawAll();
          } catch (e) {
            throw e;
          }
        }
      },
      evalExpr: (s) => {
        try {
          return math.compile(s).evaluate(Object.assign({ x: 0 }, state.vars));
        } catch (e) {
          throw e;
        }
      },
    };
    try {
      const keys = Object.keys(sandbox);
      const fn = new Function(...keys, '"use strict";\n' + code);
      const res = fn(...keys.map((k) => sandbox[k]));
      $("scriptOut").innerHTML = `<pre>${
        typeof res === "undefined" ? "OK" : JSON.stringify(res)
      }</pre>`;
      addHistory("script run");
    } catch (e) {
      $("scriptOut").innerHTML = `<pre>script error: ${
        e && e.message ? e.message : e
      }</pre>`;
    }
  });

  $("btnScriptPlot")?.addEventListener("click", () => {
    const code = $("scriptArea")?.value || "";
    try {
      const ret = new Function("math", "return (" + code + ")")(math);
      if (typeof ret === "function") {
        const sampler = {
          evaluate: ({ x }) => {
            try {
              return ret(x);
            } catch {
              return NaN;
            }
          },
        };
        state.functions.push({
          expr: "scripted()",
          compiled: sampler,
          color: randColor(state.functions.length),
        });
        drawAll();
        addHistory("script plot");
      } else if (typeof ret === "string") {
        const compiled = math.compile(ret);
        state.functions.push({
          expr: ret,
          compiled,
          color: randColor(state.functions.length),
        });
        drawAll();
        addHistory("script plot expr");
      } else alert("script did not return a function or expression string");
    } catch (e) {
      alert("script plot failed: " + (e && e.message ? e.message : e));
    }
  });
  refreshStored();
  drawAll();
})();
