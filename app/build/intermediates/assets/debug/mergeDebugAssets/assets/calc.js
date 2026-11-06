/*!
 * DesignCalc — calculation core
 * Pure functions, no DOM. Works in browser (window.Calc) and Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- helpers */

  function assertPositive(pairs) {
    Object.keys(pairs).forEach(function (name) {
      const value = pairs[name];
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(name + ' must be greater than 0');
      }
    });
  }

  function round(value, digits) {
    const f = Math.pow(10, digits === undefined ? 3 : digits);
    return Math.round(value * f) / f;
  }

  /* ------------------------------------------------------ cutting parameters */

  // Spindle speed from cutting speed: N = 1000 * Vc / (pi * D)
  function spindleSpeed(vc, d) {
    assertPositive({ 'Cutting speed': vc, 'Diameter': d });
    return (1000 * vc) / (Math.PI * d);
  }

  // Single point turning
  function turning(p) {
    assertPositive({
      'Cutting speed': p.vc, 'Diameter': p.d, 'Feed': p.f,
      'Depth of cut': p.ap, 'Length': p.length, 'Specific cutting force': p.kc,
    });
    const n = spindleSpeed(p.vc, p.d);
    const vf = p.f * n;                       // mm/min
    const mrr = 1000 * p.vc * p.f * p.ap;     // mm^3/min
    const time = p.length / vf;               // min
    const force = p.kc * p.ap * p.f;          // N
    const power = (force * p.vc) / 60;        // W
    return {
      rpm: n, feedRate: vf, mrr: mrr, time: time,
      force: force, power: power,
      taylorNote: 'MRR assumes full depth of cut on every pass.',
    };
  }

  // Drilling
  function drilling(p) {
    assertPositive({
      'Cutting speed': p.vc, 'Diameter': p.d,
      'Feed per rev': p.f, 'Hole depth': p.length,
    });
    const n = spindleSpeed(p.vc, p.d);
    const vf = p.f * n;
    const area = (Math.PI * p.d * p.d) / 4;
    const mrr = area * vf;                     // mm^3/min
    const travel = p.length + 0.3 * p.d;       // approach + point allowance
    const time = travel / vf;
    return { rpm: n, feedRate: vf, mrr: mrr, time: time, travel: travel };
  }

  // Slab / face milling
  function milling(p) {
    assertPositive({
      'Cutting speed': p.vc, 'Cutter diameter': p.d, 'Feed per tooth': p.fz,
      'Number of teeth': p.z, 'Axial depth': p.ap, 'Radial depth': p.ae, 'Length': p.length,
    });
    const n = spindleSpeed(p.vc, p.d);
    const vf = p.fz * p.z * n;                 // mm/min
    const mrr = p.ap * p.ae * vf;              // mm^3/min
    const time = p.length / vf;
    return { rpm: n, feedRate: vf, mrr: mrr, time: time, chipLoad: p.fz };
  }

  /* ------------------------------------------------------------ bearing life */

  // Basic rating life. C, P in N (same unit). n in rpm.
  function bearingLife(p) {
    assertPositive({ 'Dynamic load rating C': p.C, 'Equivalent load P': p.P, 'Speed': p.n });
    if (p.P > p.C) {
      // not an error: heavily loaded bearing, just short life
    }
    const exponent = p.exponent === 3 ? 3 : 10 / 3;
    const ratio = p.C / p.P;
    const l10rev = Math.pow(ratio, exponent) * 1e6;        // revolutions
    const l10h = l10rev / (60 * p.n);                      // hours
    const l10m = l10h / 60;                                // months (24h/day)
    return {
      l10rev: l10rev, l10h: l10h, l10m: l10m,
      exponent: exponent, ratio: ratio,
      l10hAt90: l10h,
    };
  }

  // Reliability adjusted life: Lnm = a1 * L10 (ISO 281 table values)
  function reliabilityFactor(percent) {
    const table = {
      90: 1, 95: 0.62, 96: 0.53, 97: 0.44, 98: 0.33, 99: 0.21,
    };
    return table[percent] === undefined ? null : table[percent];
  }

  /* --------------------------------------------------------- key and shaft */

  // Torque T in N*m, shaft diameter d in mm -> tangential force at key (N)
  function keyForce(torque, d) {
    assertPositive({ 'Torque': torque, 'Shaft diameter': d });
    return (2000 * torque) / d;
  }

  function keyCheck(p) {
    assertPositive({
      'Torque': p.torque, 'Shaft diameter': p.d, 'Key width': p.w,
      'Key length': p.L, 'Key height': p.h,
    });
    const force = keyForce(p.torque, p.d);
    const shearArea = p.w * p.L;
    const bearingArea = (p.h / 2) * p.L;
    const shear = force / shearArea;                 // N/mm^2 = MPa
    const bearing = force / bearingArea;             // MPa
    return {
      force: force,
      shearStress: shear,
      bearingStress: bearing,
      shearOk: Number.isFinite(p.allowShear) ? shear <= p.allowShear : null,
      bearingOk: Number.isFinite(p.allowBearing) ? bearing <= p.allowBearing : null,
    };
  }

  // Torsional shear stress in a solid circular shaft, T in N*m, d in mm
  function shaftTorsion(torque, d) {
    assertPositive({ 'Torque': torque, 'Diameter': d });
    const t = (16000 * torque) / (Math.PI * Math.pow(d, 3));
    return { shearStress: t };
  }

  // Torque from power and speed: T = 9550 * kW / rpm  (N*m)
  function torqueFromPower(kw, rpm) {
    assertPositive({ 'Power': kw, 'Speed': rpm });
    return { torque: (9550 * kw) / rpm };
  }

  /* ------------------------------------------------------ tolerance stack-up */

  // items: [{name, nominal, tol}] with symmetric +/- tol
  function stackup(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Add at least one dimension');
    }
    let nominal = 0;
    let worstTolerance = 0;
    let sumSquares = 0;
    const contributions = [];

    items.forEach(function (item) {
      const n = Number(item.nominal);
      const t = Number(item.tol);
      if (!Number.isFinite(n)) throw new Error('Nominal value is not a number: ' + item.name);
      if (!Number.isFinite(t) || t < 0) throw new Error('Tolerance must be zero or positive: ' + item.name);
      nominal += n;
      worstTolerance += t;
      sumSquares += t * t;
    });

    const rss = Math.sqrt(sumSquares);
    items.forEach(function (item) {
      const t = Number(item.tol);
      contributions.push({
        name: item.name,
        tolerance: t,
        share: sumSquares > 0 ? (t * t) / sumSquares : 0,
      });
    });
    contributions.sort(function (a, b) { return b.tolerance - a.tolerance; });

    return {
      nominal: nominal,
      worstTolerance: worstTolerance,
      worstMin: nominal - worstTolerance,
      worstMax: nominal + worstTolerance,
      rss: rss,
      rssMin: nominal - rss,
      rssMax: nominal + rss,
      contributions: contributions,
    };
  }

  /* ----------------------------------------------------------------- export */

  return {
    round: round,
    spindleSpeed: spindleSpeed,
    turning: turning,
    drilling: drilling,
    milling: milling,
    bearingLife: bearingLife,
    reliabilityFactor: reliabilityFactor,
    keyForce: keyForce,
    keyCheck: keyCheck,
    shaftTorsion: shaftTorsion,
    torqueFromPower: torqueFromPower,
    stackup: stackup,
  };
});
