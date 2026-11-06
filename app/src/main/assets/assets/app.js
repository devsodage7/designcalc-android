/*!
 * DesignCalc — UI layer
 */
(function () {
  'use strict';

  const C = window.Calc;

  const $ = function (id) { return document.getElementById(id); };

  function val(id) {
    const el = $(id);
    return el ? Number(el.value) : NaN;
  }

  function showError(id, message) {
    const el = $(id);
    el.textContent = message;
    el.hidden = false;
  }

  function clearError(id) {
    const el = $(id);
    el.textContent = '';
    el.hidden = true;
  }

  function num(value, digits) {
    if (!Number.isFinite(value)) return '—';
    const d = digits === undefined ? 2 : digits;
    const p = Math.pow(10, d);
    const rounded = Math.round(value * p) / p;
    return rounded.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }

  function result(label, value, options) {
    const opt = options || {};
    const cls = opt.primary ? 'result primary' : 'result';
    const badge = opt.ok === true ? '<span class="badge ok">safe</span>'
      : opt.ok === false ? '<span class="badge bad">over limit</span>'
      : '';
    return '<div class="' + cls + '"><span>' + label + badge + '</span><strong>' + value + '</strong></div>';
  }

  function grid(html) {
    return '<div class="result-grid">' + html + '</div>';
  }

  function minutes(value) {
    if (!Number.isFinite(value)) return '—';
    if (value < 1) return num(value * 60, 1) + ' s';
    return num(value, 2) + ' min';
  }

  /* ------------------------------------------------------------------ tabs */

  const tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  function activate(name) {
    tabs.forEach(function (tab) {
      tab.classList.toggle('is-active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.panel').forEach(function (panel) {
      panel.classList.toggle('is-active', panel.id === 'tab-' + name);
    });
    if (history.replaceState) history.replaceState(null, '', '#' + name);
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { activate(tab.dataset.tab); });
  });

  const initial = (location.hash || '').replace('#', '');
  if (initial && document.getElementById('tab-' + initial)) activate(initial);

  /* --------------------------------------------------------------- cutting */

  function syncOperationFields() {
    const op = $('op').value;
    document.querySelectorAll('[data-op]').forEach(function (el) {
      const ops = el.dataset.op.split(/\s+/);
      el.hidden = ops.indexOf(op) === -1;
    });
  }

  function computeCutting() {
    clearError('cutting-error');
    const op = $('op').value;
    const out = $('cutting-results');

    try {
      let html = '';

      if (op === 'turning') {
        const r = C.turning({
          vc: val('c-vc'), d: val('c-d'), f: val('c-f'),
          ap: val('c-ap'), length: val('c-length'), kc: val('c-kc'),
        });
        html = grid(
          result('Spindle speed', num(r.rpm, 0) + ' rpm', { primary: true }) +
          result('Feed rate', num(r.feedRate, 1) + ' mm/min') +
          result('MRR', num(r.mrr, 0) + ' mm³/min') +
          result('Machining time', minutes(r.time)) +
          result('Cutting force', num(r.force, 0) + ' N') +
          result('Cutting power', num(r.power, 0) + ' W (' + num(r.power / 1000, 2) + ' kW)')
        );
      } else if (op === 'drilling') {
        const r = C.drilling({
          vc: val('c-vc'), d: val('c-d'), f: val('c-f'), length: val('c-holedepth'),
        });
        html = grid(
          result('Spindle speed', num(r.rpm, 0) + ' rpm', { primary: true }) +
          result('Feed rate', num(r.feedRate, 1) + ' mm/min') +
          result('MRR', num(r.mrr, 0) + ' mm³/min') +
          result('Drill travel', num(r.travel, 1) + ' mm') +
          result('Machining time', minutes(r.time))
        );
      } else {
        const r = C.milling({
          vc: val('c-vc'), d: val('c-d'), fz: val('c-fz'), z: val('c-z'),
          ap: val('c-apm'), ae: val('c-ae'), length: val('c-length'),
        });
        html = grid(
          result('Spindle speed', num(r.rpm, 0) + ' rpm', { primary: true }) +
          result('Table feed', num(r.feedRate, 1) + ' mm/min') +
          result('MRR', num(r.mrr, 0) + ' mm³/min') +
          result('Machining time', minutes(r.time)) +
          result('Chip load', num(r.chipLoad, 3) + ' mm/tooth')
        );
      }

      out.innerHTML = html;
    } catch (error) {
      out.innerHTML = '';
      showError('cutting-error', error.message);
    }
  }

  $('op').addEventListener('change', function () {
    syncOperationFields();
    computeCutting();
  });
  $('cutting-go').addEventListener('click', computeCutting);

  /* --------------------------------------------------------------- bearing */

  function computeBearing() {
    clearError('bearing-error');
    const out = $('bearing-results');

    try {
      const type = $('b-type').value;
      const reliability = Number($('b-rel').value);
      const base = C.bearingLife({
        C: val('b-c'), P: val('b-p'), n: val('b-n'),
        exponent: type === 'ball' ? 3 : 10 / 3,
      });

      const a1 = C.reliabilityFactor(reliability);
      const adjusted = base.l10h * a1;

      out.innerHTML = grid(
        result('L10 life', num(base.l10h, 0) + ' h', { primary: true }) +
        result('L10 in revolutions', num(base.l10rev / 1e6, 1) + ' million rev') +
        result('L10 at 24 h/day', num(base.l10h / 24, 1) + ' days') +
        result('C / P ratio', num(base.ratio, 2)) +
        result('Life at ' + reliability + '% reliability', num(adjusted, 0) + ' h')
      );
    } catch (error) {
      out.innerHTML = '';
      showError('bearing-error', error.message);
    }
  }

  $('bearing-go').addEventListener('click', computeBearing);

  /* ------------------------------------------------------------------- key */

  function computeKey() {
    clearError('key-error');
    const out = $('key-results');

    try {
      const torque = val('k-t');
      const d = val('k-d');
      const w = val('k-w');
      const h = val('k-h');
      const L = val('k-l');
      const allowShear = val('k-shear');
      const allowBearing = val('k-bear');

      const key = C.keyCheck({
        torque: torque, d: d, w: w, h: h, L: L,
        allowShear: allowShear, allowBearing: allowBearing,
      });
      const shaft = C.shaftTorsion(torque, d);

      // minimum length needed to stay inside allowable stresses
      const force = key.force;
      const lShear = force / (w * allowShear);
      const lBearing = force / ((h / 2) * allowBearing);
      const requiredLength = Math.max(lShear, lBearing);

      out.innerHTML = grid(
        result('Tangential force on key', num(force, 0) + ' N', { primary: true }) +
        result('Key shear stress', num(key.shearStress, 1) + ' MPa', { ok: key.shearOk }) +
        result('Key bearing stress', num(key.bearingStress, 1) + ' MPa', { ok: key.bearingOk }) +
        result('Shaft torsional shear', num(shaft.shearStress, 1) + ' MPa') +
        result('Minimum key length', num(requiredLength, 1) + ' mm')
      ) + '<p class="note">Bearing area uses half the key height (standard practice for a parallel key in a shaft keyway).</p>';
    } catch (error) {
      out.innerHTML = '';
      showError('key-error', error.message);
    }
  }

  $('key-go').addEventListener('click', computeKey);

  $('k-from-power').addEventListener('click', function () {
    try {
      const r = C.torqueFromPower(val('k-kw'), val('k-rpm'));
      $('k-power-results').innerHTML = grid(
        result('Torque', num(r.torque, 2) + ' N·m', { primary: true })
      );
    } catch (error) {
      $('k-power-results').innerHTML = '<p class="error">' + error.message + '</p>';
    }
  });

  /* --------------------------------------------------------------- stackup */

  function addRow(name, nominal, tol) {
    const row = document.createElement('div');
    row.className = 'stack-row';
    row.innerHTML =
      '<input class="s-name" type="text" placeholder="Part name" value="' + (name || '') + '">' +
      '<input class="s-nominal" type="number" step="any" placeholder="0.00" value="' + (nominal === undefined ? '' : nominal) + '">' +
      '<input class="s-tol" type="number" step="any" placeholder="0.05" value="' + (tol === undefined ? '' : tol) + '">' +
      '<button class="remove" type="button" title="Remove">×</button>';

    row.querySelector('.remove').addEventListener('click', function () {
      row.remove();
    });

    $('stack-rows').appendChild(row);
  }

  function computeStack() {
    clearError('stack-error');
    const out = $('stack-results');

    try {
      const items = Array.prototype.slice.call(document.querySelectorAll('.stack-row')).map(function (row, index) {
        return {
          name: row.querySelector('.s-name').value || 'Dimension ' + (index + 1),
          nominal: Number(row.querySelector('.s-nominal').value),
          tol: Number(row.querySelector('.s-tol').value),
        };
      });

      const r = C.stackup(items);

      const bars = r.contributions.map(function (c) {
        const pct = Math.round(c.share * 100);
        return '<div class="bar-row">' +
          '<span>' + c.name + '</span>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="bar-value">' + pct + '%</span>' +
          '</div>';
      }).join('');

      out.innerHTML = grid(
        result('Nominal assembly', num(r.nominal, 3) + ' mm', { primary: true }) +
        result('Worst case', num(r.worstMin, 3) + ' … ' + num(r.worstMax, 3) + ' mm') +
        result('Worst-case band', '± ' + num(r.worstTolerance, 3) + ' mm') +
        result('Statistical (RSS)', num(r.rssMin, 3) + ' … ' + num(r.rssMax, 3) + ' mm') +
        result('RSS band', '± ' + num(r.rss, 3) + ' mm')
      ) + '<div class="bar-wrap">' + bars + '</div>' +
        '<p class="note">A part with a large share is the one worth tightening first.</p>';
    } catch (error) {
      out.innerHTML = '';
      showError('stack-error', error.message);
    }
  }

  $('stack-add').addEventListener('click', function () {
    addRow('', '', '');
  });
  $('stack-go').addEventListener('click', computeStack);

  /* ------------------------------------------------------------------ init */

  addRow('Housing width', 40, 0.1);
  addRow('Bearing width', 15, 0.05);
  addRow('Spacer', 5, 0.02);

  syncOperationFields();
  computeCutting();
  computeBearing();
  computeKey();
  computeStack();
})();
