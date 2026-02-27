const TAX_YEAR_LABEL = "Tax year: 6 April 2025 to 5 April 2026";
const STATE_PENSION_WEEKLY = 230.25;
const QUALIFYING_EARNINGS_LOWER = 6240;
const QUALIFYING_EARNINGS_UPPER = 50270;
const CURRENT_YEAR = 2026;

const RUK_BANDS = [
  { upper: 50270, rate: 0.2 },
  { upper: 125140, rate: 0.4 },
  { upper: Infinity, rate: 0.45 },
];

const SCOTLAND_BANDS = [
  { upper: 15397, rate: 0.19 },
  { upper: 27491, rate: 0.2 },
  { upper: 43662, rate: 0.21 },
  { upper: 75000, rate: 0.42 },
  { upper: 125140, rate: 0.45 },
  { upper: Infinity, rate: 0.48 },
];

const NI_THRESHOLDS = {
  primary: 12570,
  upper: 50270,
  mainRate: 0.08,
  upperRate: 0.02,
};

const taxInputs = {
  salary: document.getElementById("taxSalary"),
  preset: document.getElementById("taxCodePresetTax"),
  code: document.getElementById("taxCodeTax"),
  country: document.getElementById("countryTax"),
};

const pensionInputs = {
  salary: document.getElementById("pensionSalary"),
  preset: document.getElementById("taxCodePresetPension"),
  code: document.getElementById("taxCodePension"),
  country: document.getElementById("countryPension"),
  employeePct: document.getElementById("employeePct"),
  employerPct: document.getElementById("employerPct"),
  enhancedEmployer: document.getElementById("enhancedEmployer"),
  currentAge: document.getElementById("currentAge"),
  retirementAge: document.getElementById("retirementAge"),
  currentPot: document.getElementById("currentPot"),
  growthRate: document.getElementById("growthRate"),
  drawdownRate: document.getElementById("drawdownRate"),
};

function formatGBP(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampToNonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}

function syncTaxCodePreset(presetElement, codeElement) {
  if (presetElement.value !== "custom") {
    codeElement.value = presetElement.value;
  }
}

function parseTaxCode(codeInput, fallbackRegion) {
  let code = (codeInput || "").toUpperCase().replace(/\s+/g, "");
  code = code.replace(/(W1|M1|X|NONCUM)$/g, "");

  let region = fallbackRegion;
  if (code.startsWith("S")) {
    region = "scotland";
    code = code.slice(1);
  } else if (code.startsWith("C")) {
    region = "rUK";
    code = code.slice(1);
  }

  if (code === "NT") {
    return { region, noTax: true, allowance: 0, note: "NT code: no Income Tax." };
  }

  const flatRates = {
    BR: 0.2,
    D0: region === "scotland" ? 0.21 : 0.4,
    D1: region === "scotland" ? 0.42 : 0.45,
    D2: 0.45,
    D3: 0.48,
  };

  if (flatRates[code] !== undefined) {
    return {
      region,
      noTax: false,
      flatRate: flatRates[code],
      allowance: 0,
      note: `${code} code: flat tax rate applied to all earnings.`,
    };
  }

  if (code === "0T") {
    return { region, noTax: false, allowance: 0, note: "0T code: no Personal Allowance." };
  }

  if (/^K\d+$/.test(code)) {
    return {
      region,
      noTax: false,
      allowance: -Number(code.slice(1)) * 10,
      note: "K code: negative allowance increases taxable income.",
    };
  }

  const match = code.match(/^(\d+)[A-Z]+$/);
  if (match) {
    return {
      region,
      noTax: false,
      allowance: Number(match[1]) * 10,
      note: "Numeric tax code allowance used.",
    };
  }

  return {
    region,
    noTax: false,
    allowance: 12570,
    note: "Tax code not recognised exactly; defaulted to 1257L-style allowance.",
  };
}

function adjustedAllowance(baseAllowance, gross) {
  if (baseAllowance <= 0 || gross <= 100000) {
    return baseAllowance;
  }
  const reduction = (gross - 100000) / 2;
  return Math.max(0, baseAllowance - reduction);
}

function computeIncomeTax(gross, parsed) {
  if (parsed.noTax) {
    return 0;
  }
  if (parsed.flatRate !== undefined) {
    return clampToNonNegative(gross * parsed.flatRate);
  }

  const allowance = adjustedAllowance(parsed.allowance, gross);
  const taxableIncome = Math.max(0, gross - allowance);
  const bands = parsed.region === "scotland" ? SCOTLAND_BANDS : RUK_BANDS;
  let tax = 0;
  let previousTaxableUpper = 0;

  for (const band of bands) {
    const taxableUpper = band.upper === Infinity ? Infinity : Math.max(0, band.upper - allowance);
    const amountInBand = Math.max(0, Math.min(taxableIncome, taxableUpper) - previousTaxableUpper);
    tax += amountInBand * band.rate;
    previousTaxableUpper = taxableUpper;
  }
  return clampToNonNegative(tax);
}

function computeNI(gross) {
  const mainBand = Math.max(0, Math.min(gross, NI_THRESHOLDS.upper) - NI_THRESHOLDS.primary);
  const upperBand = Math.max(0, gross - NI_THRESHOLDS.upper);
  return mainBand * NI_THRESHOLDS.mainRate + upperBand * NI_THRESHOLDS.upperRate;
}

function computeQualifyingEarnings(gross) {
  return Math.max(0, Math.min(gross, QUALIFYING_EARNINGS_UPPER) - QUALIFYING_EARNINGS_LOWER);
}

function estimateStatePensionAge(currentAge) {
  const birthYear = CURRENT_YEAR - currentAge;
  if (birthYear < 1960) {
    return 66;
  }
  if (birthYear < 1977) {
    return 67;
  }
  return 68;
}

function futureValue(currentPot, annualContribution, growthRate, yearsToRetirement) {
  if (yearsToRetirement <= 0) {
    return currentPot;
  }
  const rate = growthRate / 100;
  if (rate === 0) {
    return currentPot + annualContribution * yearsToRetirement;
  }
  const grownPot = currentPot * (1 + rate) ** yearsToRetirement;
  const grownSeries = annualContribution * (((1 + rate) ** yearsToRetirement - 1) / rate);
  return grownPot + grownSeries;
}

function renderCommonPay(prefix, grossAnnual, incomeTax, ni, deductions, netAnnual) {
  setText(`${prefix}GrossAnnual`, formatGBP(grossAnnual));
  setText(`${prefix}IncomeTax`, formatGBP(incomeTax));
  setText(`${prefix}Ni`, formatGBP(ni));
  setText(`${prefix}Deductions`, formatGBP(deductions));
  setText(`${prefix}NetYear`, formatGBP(netAnnual));
  setText(`${prefix}NetMonth`, formatGBP(netAnnual / 12));
  setText(`${prefix}NetWeek`, formatGBP(netAnnual / 52));
  setText(`${prefix}NetDay`, formatGBP(netAnnual / 365));
  setText(`${prefix}EffectiveRate`, `${((deductions / (grossAnnual || 1)) * 100).toFixed(2)}%`);
}

function renderTaxTab() {
  const grossAnnual = clampToNonNegative(Number(taxInputs.salary.value));
  const parsed = parseTaxCode(taxInputs.code.value, taxInputs.country.value);
  const incomeTax = computeIncomeTax(grossAnnual, parsed);
  const ni = computeNI(grossAnnual);
  const deductions = incomeTax + ni;
  const netAnnual = Math.max(0, grossAnnual - deductions);

  renderCommonPay("tax", grossAnnual, incomeTax, ni, deductions, netAnnual);
  setText("taxCalcNote", `${TAX_YEAR_LABEL}. ${parsed.note}`);
}

function renderPensionTab() {
  const grossAnnual = clampToNonNegative(Number(pensionInputs.salary.value));
  const parsed = parseTaxCode(pensionInputs.code.value, pensionInputs.country.value);
  const employeePct = clamp(Number(pensionInputs.employeePct.value) || 0, 0, 100);
  const employerPct = clamp(Number(pensionInputs.employerPct.value) || 0, 0, 100);
  const currentAge = clamp(Number(pensionInputs.currentAge.value) || 30, 16, 100);
  const retirementAge = clamp(Number(pensionInputs.retirementAge.value) || 67, 50, 100);
  const currentPot = clampToNonNegative(Number(pensionInputs.currentPot.value));
  const growthRate = clamp(Number(pensionInputs.growthRate.value) || 0, 0, 15);
  const drawdownRate = clamp(Number(pensionInputs.drawdownRate.value) || 4, 1, 10);

  const qualifyingEarnings = computeQualifyingEarnings(grossAnnual);
  const employeeContribution = qualifyingEarnings * (employeePct / 100);
  const employerContribution = qualifyingEarnings * (employerPct / 100);
  const taxableAfterPension = Math.max(0, grossAnnual - employeeContribution);

  const incomeTax = computeIncomeTax(taxableAfterPension, parsed);
  const ni = computeNI(taxableAfterPension);
  const deductions = employeeContribution + incomeTax + ni;
  const netAnnual = Math.max(0, grossAnnual - deductions);

  renderCommonPay("pension", grossAnnual, incomeTax, ni, deductions, netAnnual);
  setText("employeePensionAnnual", formatGBP(employeeContribution));
  setText("employerPensionAnnual", formatGBP(employerContribution));
  setText("qualifyingEarningsAnnual", formatGBP(qualifyingEarnings));

  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const annualTotalContribution = employeeContribution + employerContribution;
  const projectedPot = futureValue(currentPot, annualTotalContribution, growthRate, yearsToRetirement);
  const privateWeeklyAtRetirement = (projectedPot * (drawdownRate / 100)) / 52;

  const statePensionAge = estimateStatePensionAge(currentAge);
  const weeklyAtRetirement = privateWeeklyAtRetirement + (retirementAge >= statePensionAge ? STATE_PENSION_WEEKLY : 0);
  const weeklyWithState = privateWeeklyAtRetirement + STATE_PENSION_WEEKLY;

  setText("projectedPot", formatGBP(projectedPot));
  setText("privateWeeklyAtRetirement", formatGBP(privateWeeklyAtRetirement));
  setText("statePensionAge", String(statePensionAge));
  setText("statePensionWeekly", formatGBP(STATE_PENSION_WEEKLY));
  setText("weeklyAtRetirement", formatGBP(weeklyAtRetirement));
  setText("weeklyWithState", formatGBP(weeklyWithState));
  setText(
    "pensionCalcNote",
    `${TAX_YEAR_LABEL}. State Pension shown is full new State Pension and depends on NI record. Pension tax/NI estimate assumes salary sacrifice-style treatment for employee contributions.`
  );
}

function updateAll() {
  renderTaxTab();
  renderPensionTab();
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.tab;
      buttons.forEach((b) => {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-selected", b === button ? "true" : "false");
      });
      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.id === `tab-${target}`);
      });
    });
  });
}

function setupInputListeners() {
  taxInputs.preset.addEventListener("change", () => {
    syncTaxCodePreset(taxInputs.preset, taxInputs.code);
    updateAll();
  });
  pensionInputs.preset.addEventListener("change", () => {
    syncTaxCodePreset(pensionInputs.preset, pensionInputs.code);
    updateAll();
  });

  pensionInputs.enhancedEmployer.addEventListener("change", () => {
    pensionInputs.employerPct.value = pensionInputs.enhancedEmployer.checked ? "6" : "3";
    updateAll();
  });

  const allInputs = document.querySelectorAll("input, select");
  allInputs.forEach((field) => {
    field.addEventListener("input", updateAll);
    field.addEventListener("change", updateAll);
  });
}

setupTabs();
setupInputListeners();
updateAll();
