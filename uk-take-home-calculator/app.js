const TAX_YEAR_LABEL = "Tax year: 6 April 2025 to 5 April 2026";

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

const salaryInput = document.getElementById("salary");
const taxCodePreset = document.getElementById("taxCodePreset");
const taxCodeInput = document.getElementById("taxCode");
const countryInput = document.getElementById("country");
const calculateBtn = document.getElementById("calculateBtn");
const calcNote = document.getElementById("calcNote");

taxCodePreset.addEventListener("change", () => {
  if (taxCodePreset.value !== "custom") {
    taxCodeInput.value = taxCodePreset.value;
  }
});

calculateBtn.addEventListener("click", calculateAndRender);
salaryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    calculateAndRender();
  }
});

function formatGBP(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function clampToNonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
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
    const amountInBand = Math.max(
      0,
      Math.min(taxableIncome, taxableUpper) - previousTaxableUpper
    );
    tax += amountInBand * band.rate;
    previousTaxableUpper = taxableUpper;
  }

  return clampToNonNegative(tax);
}

function computeNI(gross) {
  const mainBand = Math.max(0, Math.min(gross, NI_THRESHOLDS.upper) - NI_THRESHOLDS.primary);
  const upperBand = Math.max(0, gross - NI_THRESHOLDS.upper);
  return (
    mainBand * NI_THRESHOLDS.mainRate +
    upperBand * NI_THRESHOLDS.upperRate
  );
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function calculateAndRender() {
  const grossAnnual = clampToNonNegative(Number(salaryInput.value));
  const parsed = parseTaxCode(taxCodeInput.value, countryInput.value);
  const incomeTax = computeIncomeTax(grossAnnual, parsed);
  const ni = computeNI(grossAnnual);
  const deductions = incomeTax + ni;
  const netAnnual = Math.max(0, grossAnnual - deductions);

  setText("grossAnnual", formatGBP(grossAnnual));
  setText("incomeTax", formatGBP(incomeTax));
  setText("ni", formatGBP(ni));
  setText("deductions", formatGBP(deductions));
  setText("netYear", formatGBP(netAnnual));
  setText("netMonth", formatGBP(netAnnual / 12));
  setText("netWeek", formatGBP(netAnnual / 52));
  setText("netDay", formatGBP(netAnnual / 365));
  setText("effectiveRate", `${((deductions / (grossAnnual || 1)) * 100).toFixed(2)}%`);

  calcNote.textContent = `${TAX_YEAR_LABEL}. ${parsed.note}`;
}

calculateAndRender();
