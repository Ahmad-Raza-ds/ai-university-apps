/**
 * ============================================================================
 * CGPA Calculator - Academic GPA & CGPA Engine
 * ============================================================================
 * Standard 4.00 Grading Scale
 * Features:
 *  - Dynamic Course Rows (1-10) with Data Retention
 *  - Semester 1-8 Handling (Semester 1 disengages prior record requirements)
 *  - Strict Field-Level & Form-Level Validation
 *  - Real-time Error Clearing on User Input
 *  - Full LocalStorage State Persistence & Restoration
 *  - Theme Toggle (Light/Dark Mode) with LocalStorage Sync
 *  - Copy Result Summary & Print Support
 * ============================================================================
 */

'use strict';

/* ----------------------------------------------------------------------------
   1. Official Grade Scale & Academic Standing Configurations
   ---------------------------------------------------------------------------- */
const GRADE_SCALE = {
  'A': 4.00,
  'A-': 3.67,
  'B+': 3.33,
  'B': 3.00,
  'B-': 2.67,
  'C+': 2.33,
  'C': 2.00,
  'C-': 1.67,
  'D+': 1.33,
  'D': 1.00,
  'F': 0.00
};

const CREDIT_OPTIONS = [1, 2, 3, 4];

const ACADEMIC_STATUS_TIERS = [
  {
    minCgpa: 3.70,
    title: 'Outstanding Academic Standing (Summa Cum Laude)',
    description: 'Exceptional academic performance! You are excelling at the highest honors level.',
    accent: '#15803d'
  },
  {
    minCgpa: 3.30,
    title: 'Very Good Academic Standing (Magna Cum Laude)',
    description: 'Great accomplishment! You maintain strong honors and exemplary grades.',
    accent: '#4f46e5'
  },
  {
    minCgpa: 3.00,
    title: 'Good Academic Standing (Cum Laude)',
    description: 'Solid performance! You are meeting dean’s honors standards.',
    accent: '#4f46e5'
  },
  {
    minCgpa: 2.50,
    title: 'Satisfactory Academic Progress',
    description: 'Steady progress. You are meeting standard academic requirements.',
    accent: '#64748b'
  },
  {
    minCgpa: 2.00,
    title: 'Academic Pass / Needs Improvement',
    description: 'Borderline standing. Target higher grades next term to build a safety buffer.',
    accent: '#d97706'
  },
  {
    minCgpa: 0.00,
    title: 'Academic Probation / Critical Warning',
    description: 'CGPA is below minimum graduation requirements (2.00). Consult an academic advisor immediately.',
    accent: '#dc2626'
  }
];

const STORAGE_KEY_FORM = 'cgpa_calculator_data_v1';
const STORAGE_KEY_THEME = 'cgpa_calculator_theme';

/* ----------------------------------------------------------------------------
   2. DOM Elements Cache
   ---------------------------------------------------------------------------- */
const DOM = {
  // Theme & Modals
  html: document.documentElement,
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  guideModalBtn: document.getElementById('guideModalBtn'),
  guideModal: document.getElementById('guideModal'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  closeModalBottomBtn: document.getElementById('closeModalBottomBtn'),
  toast: document.getElementById('toast'),

  // Academic Record Controls
  semesterSelect: document.getElementById('semesterSelect'),
  prevCgpa: document.getElementById('prevCgpa'),
  prevCredits: document.getElementById('prevCredits'),
  prevCgpaError: document.getElementById('prevCgpaError'),
  prevCreditsError: document.getElementById('prevCreditsError'),
  prevCgpaStar: document.getElementById('prevCgpaStar'),
  prevCreditsStar: document.getElementById('prevCreditsStar'),
  sem1Notice: document.getElementById('sem1Notice'),

  // Course Controls
  subjectCount: document.getElementById('subjectCount'),
  coursesList: document.getElementById('coursesList'),
  validationBanner: document.getElementById('validationBanner'),
  validationTitle: document.getElementById('validationTitle'),
  validationText: document.getElementById('validationText'),
  calculateBtn: document.getElementById('calculateBtn'),
  resetBtn: document.getElementById('resetBtn'),

  // Results Section
  resultsSection: document.getElementById('resultsSection'),
  standingTitle: document.getElementById('standingTitle'),
  standingDescription: document.getElementById('standingDescription'),
  displaySemGpa: document.getElementById('displaySemGpa'),
  semPointsEarned: document.getElementById('semPointsEarned'),
  displayCgpa: document.getElementById('displayCgpa'),
  cgpaSubtext: document.getElementById('cgpaSubtext'),
  displayTotalCredits: document.getElementById('displayTotalCredits'),
  creditBreakdownText: document.getElementById('creditBreakdownText'),
  breakdownTableBody: document.getElementById('breakdownTableBody'),
  tableTotalCredits: document.getElementById('tableTotalCredits'),
  tableGpa: document.getElementById('tableGpa'),
  tableTotalQualityPoints: document.getElementById('tableTotalQualityPoints'),
  copyResultBtn: document.getElementById('copyResultBtn'),
  copyBtnText: document.getElementById('copyBtnText'),
  printResultBtn: document.getElementById('printResultBtn')
};

// Application State
let currentCalculationResult = null;
let saveDebounceTimer = null;

/* ----------------------------------------------------------------------------
   3. Initialization
   ---------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  bindEventListeners();
  loadSavedDataOrInit();
});

/* ----------------------------------------------------------------------------
   4. Theme Management
   ---------------------------------------------------------------------------- */
function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
  if (savedTheme === 'dark' || savedTheme === 'light') {
    applyTheme(savedTheme);
  } else {
    // Respect system preference
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

function applyTheme(theme) {
  DOM.html.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY_THEME, theme);
}

function toggleTheme() {
  const current = DOM.html.getAttribute('data-theme') || 'light';
  const nextTheme = current === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
}

/* ----------------------------------------------------------------------------
   5. Event Listeners Binding
   ---------------------------------------------------------------------------- */
function bindEventListeners() {
  // Theme toggle
  DOM.themeToggleBtn.addEventListener('click', toggleTheme);

  // Guide Modal
  DOM.guideModalBtn.addEventListener('click', () => openModal(DOM.guideModal));
  DOM.closeModalBtn.addEventListener('click', () => closeModal(DOM.guideModal));
  DOM.closeModalBottomBtn.addEventListener('click', () => closeModal(DOM.guideModal));
  DOM.guideModal.addEventListener('click', (e) => {
    if (e.target === DOM.guideModal) closeModal(DOM.guideModal);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !DOM.guideModal.classList.contains('hidden')) {
      closeModal(DOM.guideModal);
    }
  });

  // Semester change handler
  DOM.semesterSelect.addEventListener('change', () => {
    handleSemesterChange();
    triggerAutoSave();
  });

  // Number of subjects change handler
  DOM.subjectCount.addEventListener('change', () => {
    const count = parseInt(DOM.subjectCount.value, 10);
    renderCourseRows(count, true);
    triggerAutoSave();
  });

  // Calculation button
  DOM.calculateBtn.addEventListener('click', handleCalculateClick);

  // Reset button
  DOM.resetBtn.addEventListener('click', handleResetClick);

  // Results Actions
  DOM.copyResultBtn.addEventListener('click', handleCopyResults);
  DOM.printResultBtn.addEventListener('click', () => window.print());

  // Input sanitization & dynamic error clearing for prior record
  DOM.prevCgpa.addEventListener('input', () => {
    clearInputError(DOM.prevCgpa, DOM.prevCgpaError);
    triggerAutoSave();
  });

  DOM.prevCredits.addEventListener('input', () => {
    clearInputError(DOM.prevCredits, DOM.prevCreditsError);
    triggerAutoSave();
  });
}

function openModal(modalEl) {
  modalEl.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalEl) {
  modalEl.classList.add('hidden');
  document.body.style.overflow = '';
}

/* ----------------------------------------------------------------------------
   6. Semester Selection Dynamics
   ---------------------------------------------------------------------------- */
function handleSemesterChange() {
  const semester = parseInt(DOM.semesterSelect.value, 10);
  const isSem1 = semester === 1;

  if (isSem1) {
    DOM.prevCgpa.disabled = true;
    DOM.prevCredits.disabled = true;
    DOM.prevCgpa.value = '';
    DOM.prevCredits.value = '';
    clearInputError(DOM.prevCgpa, DOM.prevCgpaError);
    clearInputError(DOM.prevCredits, DOM.prevCreditsError);
    DOM.sem1Notice.classList.remove('hidden');
    DOM.prevCgpaStar.style.display = 'none';
    DOM.prevCreditsStar.style.display = 'none';
  } else {
    DOM.prevCgpa.disabled = false;
    DOM.prevCredits.disabled = false;
    DOM.sem1Notice.classList.add('hidden');
    DOM.prevCgpaStar.style.display = 'inline';
    DOM.prevCreditsStar.style.display = 'inline';
  }
}

/* ----------------------------------------------------------------------------
   7. Dynamic Course Rows Generation with Data Preservation
   ---------------------------------------------------------------------------- */
/**
 * Renders the specified number of course rows.
 * If preserveExisting is true, current entered course values are preserved.
 */
function renderCourseRows(count, preserveExisting = true, savedCourses = null) {
  // Collect existing data if requested
  const existingData = [];
  if (preserveExisting && !savedCourses) {
    const rows = DOM.coursesList.querySelectorAll('.course-row');
    rows.forEach((row) => {
      const nameInput = row.querySelector('.course-name');
      const creditsSelect = row.querySelector('.course-credits');
      const gradeSelect = row.querySelector('.course-grade');
      existingData.push({
        name: nameInput ? nameInput.value : '',
        credits: creditsSelect ? creditsSelect.value : '',
        grade: gradeSelect ? gradeSelect.value : ''
      });
    });
  }

  const dataToUse = savedCourses || existingData;

  // Clear container
  DOM.coursesList.innerHTML = '';

  for (let i = 1; i <= count; i++) {
    const existing = dataToUse[i - 1] || { name: '', credits: '', grade: '' };
    const rowEl = createCourseRowElement(i, existing);
    DOM.coursesList.appendChild(rowEl);
  }

  // Clear global validation banner if row count changes
  hideValidationBanner();
}

/**
 * Creates a single course row DOM element with full accessibility attributes.
 */
function createCourseRowElement(index, initialValues = { name: '', credits: '', grade: '' }) {
  const row = document.createElement('div');
  row.className = 'course-row';
  row.dataset.rowIndex = index;

  // Row Number
  const numBadge = document.createElement('div');
  numBadge.className = 'row-number';
  numBadge.textContent = `#${index}`;
  numBadge.setAttribute('aria-label', `Course number ${index}`);

  // Course Name Group
  const nameGroup = document.createElement('div');
  nameGroup.className = 'course-field-group';
  
  const nameMobileLabel = document.createElement('label');
  nameMobileLabel.className = 'field-mobile-label';
  nameMobileLabel.htmlFor = `courseName_${index}`;
  nameMobileLabel.textContent = `Course Name / Code #${index} *`;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = `courseName_${index}`;
  nameInput.className = 'form-control course-name';
  nameInput.placeholder = `e.g. Course ${index} (Data Structures / MATH101)`;
  nameInput.value = initialValues.name || '';
  nameInput.setAttribute('aria-label', `Course ${index} Name`);

  nameInput.addEventListener('input', () => {
    if (nameInput.classList.contains('input-error')) {
      nameInput.classList.remove('input-error');
      checkAllErrorsCleared();
    }
    triggerAutoSave();
  });

  nameGroup.appendChild(nameMobileLabel);
  nameGroup.appendChild(nameInput);

  // Credit Hours Group
  const creditsGroup = document.createElement('div');
  creditsGroup.className = 'course-field-group';

  const creditsMobileLabel = document.createElement('label');
  creditsMobileLabel.className = 'field-mobile-label';
  creditsMobileLabel.htmlFor = `courseCredits_${index}`;
  creditsMobileLabel.textContent = `Credit Hours #${index} *`;

  const creditsSelectWrapper = document.createElement('div');
  creditsSelectWrapper.className = 'select-wrapper';

  const creditsSelect = document.createElement('select');
  creditsSelect.id = `courseCredits_${index}`;
  creditsSelect.className = 'form-control course-credits';
  creditsSelect.setAttribute('aria-label', `Course ${index} Credit Hours`);

  // Placeholder option
  const credPlaceholder = document.createElement('option');
  credPlaceholder.value = '';
  credPlaceholder.textContent = 'Credits';
  credPlaceholder.disabled = true;
  if (!initialValues.credits) credPlaceholder.selected = true;
  creditsSelect.appendChild(credPlaceholder);

  // Credit options (1, 2, 3, 4)
  CREDIT_OPTIONS.forEach((cred) => {
    const opt = document.createElement('option');
    opt.value = cred.toString();
    opt.textContent = `${cred} ${cred === 1 ? 'Credit' : 'Credits'}`;
    if (initialValues.credits && initialValues.credits.toString() === cred.toString()) {
      opt.selected = true;
    }
    creditsSelect.appendChild(opt);
  });

  creditsSelect.addEventListener('change', () => {
    if (creditsSelect.classList.contains('input-error')) {
      creditsSelect.classList.remove('input-error');
      checkAllErrorsCleared();
    }
    triggerAutoSave();
  });

  creditsSelectWrapper.appendChild(creditsSelect);
  creditsGroup.appendChild(creditsMobileLabel);
  creditsGroup.appendChild(creditsSelectWrapper);

  // Grade Group
  const gradeGroup = document.createElement('div');
  gradeGroup.className = 'course-field-group';

  const gradeMobileLabel = document.createElement('label');
  gradeMobileLabel.className = 'field-mobile-label';
  gradeMobileLabel.htmlFor = `courseGrade_${index}`;
  gradeMobileLabel.textContent = `Grade #${index} *`;

  const gradeSelectWrapper = document.createElement('div');
  gradeSelectWrapper.className = 'select-wrapper';

  const gradeSelect = document.createElement('select');
  gradeSelect.id = `courseGrade_${index}`;
  gradeSelect.className = 'form-control course-grade';
  gradeSelect.setAttribute('aria-label', `Course ${index} Grade`);

  // Placeholder option
  const gradePlaceholder = document.createElement('option');
  gradePlaceholder.value = '';
  gradePlaceholder.textContent = 'Grade';
  gradePlaceholder.disabled = true;
  if (!initialValues.grade) gradePlaceholder.selected = true;
  gradeSelect.appendChild(gradePlaceholder);

  // Grade options from GRADE_SCALE
  Object.keys(GRADE_SCALE).forEach((gradeLetter) => {
    const opt = document.createElement('option');
    opt.value = gradeLetter;
    opt.textContent = `${gradeLetter} (${GRADE_SCALE[gradeLetter].toFixed(2)})`;
    if (initialValues.grade === gradeLetter) {
      opt.selected = true;
    }
    gradeSelect.appendChild(opt);
  });

  gradeSelect.addEventListener('change', () => {
    if (gradeSelect.classList.contains('input-error')) {
      gradeSelect.classList.remove('input-error');
      checkAllErrorsCleared();
    }
    triggerAutoSave();
  });

  gradeSelectWrapper.appendChild(gradeSelect);
  gradeGroup.appendChild(gradeMobileLabel);
  gradeGroup.appendChild(gradeSelectWrapper);

  // Assemble Row
  row.appendChild(numBadge);
  row.appendChild(nameGroup);
  row.appendChild(creditsGroup);
  row.appendChild(gradeGroup);

  return row;
}

/* ----------------------------------------------------------------------------
   8. Strict Validation Engine
   ---------------------------------------------------------------------------- */
/**
 * Performs rigorous form validation across prior academic record and all courses.
 * Returns { isValid: boolean, firstInvalidElement: HTMLElement | null, errors: string[] }
 */
function validateForm() {
  const semester = parseInt(DOM.semesterSelect.value, 10);
  const totalCount = parseInt(DOM.subjectCount.value, 10);
  const errors = [];
  let firstInvalidElement = null;

  function markInvalid(element, message = null) {
    element.classList.add('input-error');
    if (!firstInvalidElement) {
      firstInvalidElement = element;
    }
    if (message) {
      errors.push(message);
    }
  }

  // 1. Validate Previous Academic Record (for Semesters 2 to 8)
  if (semester > 1) {
    const rawPrevCgpa = DOM.prevCgpa.value.trim();
    const rawPrevCredits = DOM.prevCredits.value.trim();

    // Check Previous CGPA
    if (rawPrevCgpa === '') {
      markInvalid(DOM.prevCgpa, 'Previous CGPA is required for Semester ' + semester + '.');
      showFieldError(DOM.prevCgpaError, 'Please enter your previous CGPA.');
    } else {
      const prevCgpaVal = parseFloat(rawPrevCgpa);
      if (isNaN(prevCgpaVal) || prevCgpaVal < 0 || prevCgpaVal > 4.00) {
        markInvalid(DOM.prevCgpa, 'Previous CGPA must be a valid number between 0.00 and 4.00.');
        showFieldError(DOM.prevCgpaError, 'CGPA must be between 0.00 and 4.00.');
      } else {
        clearInputError(DOM.prevCgpa, DOM.prevCgpaError);
      }
    }

    // Check Previous Credits
    if (rawPrevCredits === '') {
      markInvalid(DOM.prevCredits, 'Previous credit hours are required for Semester ' + semester + '.');
      showFieldError(DOM.prevCreditsError, 'Please enter your previous completed credit hours.');
    } else {
      const prevCreditsVal = parseFloat(rawPrevCredits);
      if (isNaN(prevCreditsVal) || prevCreditsVal <= 0 || prevCreditsVal > 300) {
        markInvalid(DOM.prevCredits, 'Previous credit hours must be a positive number (1 to 300).');
        showFieldError(DOM.prevCreditsError, 'Credit hours must be a valid positive number.');
      } else {
        clearInputError(DOM.prevCredits, DOM.prevCreditsError);
      }
    }
  } else {
    // Semester 1: Ensure previous error highlights are clean
    clearInputError(DOM.prevCgpa, DOM.prevCgpaError);
    clearInputError(DOM.prevCredits, DOM.prevCreditsError);
  }

  // 2. Validate Current Semester Course Rows
  const courseRows = DOM.coursesList.querySelectorAll('.course-row');
  let incompleteRowCount = 0;
  const incompleteIndices = [];

  courseRows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const nameInput = row.querySelector('.course-name');
    const creditsSelect = row.querySelector('.course-credits');
    const gradeSelect = row.querySelector('.course-grade');

    let rowIncomplete = false;

    // Check Course Name
    if (!nameInput.value.trim()) {
      markInvalid(nameInput);
      rowIncomplete = true;
    }

    // Check Credit Hours
    if (!creditsSelect.value || !CREDIT_OPTIONS.includes(parseInt(creditsSelect.value, 10))) {
      markInvalid(creditsSelect);
      rowIncomplete = true;
    }

    // Check Grade
    if (!gradeSelect.value || !(gradeSelect.value in GRADE_SCALE)) {
      markInvalid(gradeSelect);
      rowIncomplete = true;
    }

    if (rowIncomplete) {
      incompleteRowCount++;
      incompleteIndices.push(rowNum);
    }
  });

  // If course rows have missing info, build friendly summary
  if (incompleteRowCount > 0) {
    if (incompleteRowCount === totalCount) {
      errors.push(`Please complete all ${totalCount} subjects to continue.`);
    } else {
      errors.push(`Please complete all ${totalCount} subjects to continue. Missing details in Subject #${incompleteIndices.join(', #')}.`);
    }
  }

  const isValid = errors.length === 0;
  return { isValid, firstInvalidElement, errors };
}

function showFieldError(errorEl, message) {
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  }
}

function clearInputError(inputEl, errorEl) {
  if (inputEl) {
    inputEl.classList.remove('input-error');
  }
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.remove('visible');
  }
}

function checkAllErrorsCleared() {
  const anyCourseError = DOM.coursesList.querySelector('.input-error');
  const anyPrevError = DOM.prevCgpa.classList.contains('input-error') || DOM.prevCredits.classList.contains('input-error');
  if (!anyCourseError && !anyPrevError) {
    hideValidationBanner();
  }
}

function showValidationBanner(title, message) {
  DOM.validationTitle.textContent = title;
  DOM.validationText.textContent = message;
  DOM.validationBanner.classList.remove('hidden');
}

function hideValidationBanner() {
  DOM.validationBanner.classList.add('hidden');
}

/* ----------------------------------------------------------------------------
   9. Calculation Engine
   ---------------------------------------------------------------------------- */
/**
 * Calculates Semester GPA and Overall CGPA according to standard university rules.
 */
function performCalculation() {
  const semester = parseInt(DOM.semesterSelect.value, 10);
  const rows = DOM.coursesList.querySelectorAll('.course-row');

  let totalSemesterCredits = 0;
  let totalSemesterQualityPoints = 0;
  const courseDetails = [];

  rows.forEach((row, idx) => {
    const courseName = row.querySelector('.course-name').value.trim();
    const credits = parseFloat(row.querySelector('.course-credits').value);
    const grade = row.querySelector('.course-grade').value;
    const gradePoint = GRADE_SCALE[grade];
    const qualityPoints = credits * gradePoint;

    totalSemesterCredits += credits;
    totalSemesterQualityPoints += qualityPoints;

    courseDetails.push({
      index: idx + 1,
      name: courseName,
      credits: credits,
      grade: grade,
      gradePoint: gradePoint,
      qualityPoints: qualityPoints
    });
  });

  // Calculate Semester GPA (guarded against division by zero)
  const semesterGpa = totalSemesterCredits > 0
    ? (totalSemesterQualityPoints / totalSemesterCredits)
    : 0.00;

  let overallCgpa = 0.00;
  let priorCredits = 0;
  let priorQualityPoints = 0;
  let totalCumulativeCredits = totalSemesterCredits;

  if (semester === 1) {
    // For semester 1, CGPA is identical to semester GPA
    overallCgpa = semesterGpa;
    priorCredits = 0;
  } else {
    // Semesters 2 to 8
    const prevCgpa = parseFloat(DOM.prevCgpa.value.trim());
    priorCredits = parseFloat(DOM.prevCredits.value.trim());
    priorQualityPoints = prevCgpa * priorCredits;

    totalCumulativeCredits = priorCredits + totalSemesterCredits;
    const totalCumulativeQualityPoints = priorQualityPoints + totalSemesterQualityPoints;

    overallCgpa = totalCumulativeCredits > 0
      ? (totalCumulativeQualityPoints / totalCumulativeCredits)
      : 0.00;
  }

  // Academic Standing Tier lookup
  const standingTier = ACADEMIC_STATUS_TIERS.find((tier) => overallCgpa >= tier.minCgpa)
    || ACADEMIC_STATUS_TIERS[ACADEMIC_STATUS_TIERS.length - 1];

  return {
    semester,
    semesterGpa,
    overallCgpa,
    totalSemesterCredits,
    totalSemesterQualityPoints,
    priorCredits,
    priorQualityPoints,
    totalCumulativeCredits,
    courseDetails,
    standingTier
  };
}

/* ----------------------------------------------------------------------------
   10. Results Rendering
   ---------------------------------------------------------------------------- */
function renderResults(result) {
  currentCalculationResult = result;

  // 1. Semester GPA Card
  DOM.displaySemGpa.textContent = result.semesterGpa.toFixed(2);
  DOM.semPointsEarned.textContent = result.totalSemesterQualityPoints.toFixed(2);

  // 2. Updated Overall CGPA Card
  DOM.displayCgpa.textContent = result.overallCgpa.toFixed(2);
  if (result.semester === 1) {
    DOM.cgpaSubtext.textContent = 'Semester 1 initial cumulative CGPA';
  } else {
    DOM.cgpaSubtext.textContent = `Cumulative across ${result.semester} semesters`;
  }

  // 3. Total Credit Hours Card
  DOM.displayTotalCredits.textContent = result.totalCumulativeCredits.toString();
  if (result.semester === 1) {
    DOM.creditBreakdownText.textContent = `${result.totalSemesterCredits} Current Semester Credits`;
  } else {
    DOM.creditBreakdownText.textContent = `${result.priorCredits} Prior + ${result.totalSemesterCredits} Current Semester`;
  }

  // 4. Academic Standing Banner
  DOM.standingTitle.textContent = result.standingTier.title;
  DOM.standingDescription.textContent = result.standingTier.description;

  // 5. Course Breakdown Table
  DOM.breakdownTableBody.innerHTML = '';
  result.courseDetails.forEach((course) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${course.index}</td>
      <td><strong>${escapeHtml(course.name)}</strong></td>
      <td class="text-center">${course.credits}</td>
      <td class="text-center"><strong>${course.grade}</strong></td>
      <td class="text-right">${course.gradePoint.toFixed(2)}</td>
      <td class="text-right">${course.qualityPoints.toFixed(2)}</td>
    `;
    DOM.breakdownTableBody.appendChild(tr);
  });

  // Table Footers
  DOM.tableTotalCredits.textContent = result.totalSemesterCredits.toString();
  DOM.tableGpa.textContent = result.semesterGpa.toFixed(2);
  DOM.tableTotalQualityPoints.textContent = result.totalSemesterQualityPoints.toFixed(2);

  // Unhide results section
  DOM.resultsSection.classList.remove('hidden');

  // Smooth scroll into results view
  DOM.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ----------------------------------------------------------------------------
   11. Action Handlers (Calculate, Reset, Copy)
   ---------------------------------------------------------------------------- */
function handleCalculateClick() {
  const validation = validateForm();

  if (!validation.isValid) {
    // Show friendly error message
    const mainMsg = validation.errors[0] || 'Please complete all required fields.';
    showValidationBanner('Please Complete Required Fields', mainMsg);

    // Focus the first invalid input element
    if (validation.firstInvalidElement) {
      validation.firstInvalidElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      validation.firstInvalidElement.focus();
    }
    return;
  }

  // Validation passed!
  hideValidationBanner();
  const result = performCalculation();
  renderResults(result);
  triggerAutoSave();
}

function handleResetClick() {
  if (confirm('Are you sure you want to reset all fields and calculations?')) {
    // Clear LocalStorage data
    localStorage.removeItem(STORAGE_KEY_FORM);
    currentCalculationResult = null;

    // Reset Form Fields
    DOM.semesterSelect.value = '1';
    DOM.prevCgpa.value = '';
    DOM.prevCredits.value = '';
    DOM.subjectCount.value = '5';

    clearInputError(DOM.prevCgpa, DOM.prevCgpaError);
    clearInputError(DOM.prevCredits, DOM.prevCreditsError);
    hideValidationBanner();
    handleSemesterChange();

    // Re-render fresh empty rows
    renderCourseRows(5, false);

    // Hide results card
    DOM.resultsSection.classList.add('hidden');

    showToast('All fields have been reset.');
  }
}

function handleCopyResults() {
  if (!currentCalculationResult) {
    showToast('Please calculate your CGPA first.');
    return;
  }

  const res = currentCalculationResult;
  const summaryText = [
    `🎓 Academic CGPA Summary`,
    `----------------------------------------`,
    `Semester: ${res.semester}`,
    `Semester GPA: ${res.semesterGpa.toFixed(2)} / 4.00`,
    `Overall Cumulative CGPA: ${res.overallCgpa.toFixed(2)} / 4.00`,
    `Academic Standing: ${res.standingTier.title}`,
    `Total Completed Credits: ${res.totalCumulativeCredits} hrs (${res.priorCredits} Prior + ${res.totalSemesterCredits} Current)`,
    `Semester Quality Points: ${res.totalSemesterQualityPoints.toFixed(2)}`,
    `----------------------------------------`,
    `Calculated with Standard 4.0 CGPA Calculator`
  ].join('\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(summaryText)
      .then(() => {
        DOM.copyBtnText.textContent = 'Copied!';
        showToast('Summary copied to clipboard!');
        setTimeout(() => {
          DOM.copyBtnText.textContent = 'Copy Summary';
        }, 2000);
      })
      .catch(() => fallbackCopy(summaryText));
  } else {
    fallbackCopy(summaryText);
  }
}

function fallbackCopy(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
    DOM.copyBtnText.textContent = 'Copied!';
    showToast('Summary copied to clipboard!');
    setTimeout(() => {
      DOM.copyBtnText.textContent = 'Copy Summary';
    }, 2000);
  } catch (err) {
    showToast('Unable to copy automatically.');
  }
  document.body.removeChild(textArea);
}

function showToast(message) {
  DOM.toast.textContent = message;
  DOM.toast.classList.remove('hidden');
  clearTimeout(DOM.toast._timer);
  DOM.toast._timer = setTimeout(() => {
    DOM.toast.classList.add('hidden');
  }, 2600);
}

/* ----------------------------------------------------------------------------
   12. LocalStorage Persistence Engine
   ---------------------------------------------------------------------------- */
function triggerAutoSave() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveFormData();
  }, 300);
}

function saveFormData() {
  try {
    const courseRows = DOM.coursesList.querySelectorAll('.course-row');
    const courses = [];
    courseRows.forEach((row) => {
      courses.push({
        name: row.querySelector('.course-name').value,
        credits: row.querySelector('.course-credits').value,
        grade: row.querySelector('.course-grade').value
      });
    });

    const payload = {
      semester: DOM.semesterSelect.value,
      prevCgpa: DOM.prevCgpa.value,
      prevCredits: DOM.prevCredits.value,
      subjectCount: DOM.subjectCount.value,
      courses: courses,
      lastCalculated: currentCalculationResult ? true : false
    };

    localStorage.setItem(STORAGE_KEY_FORM, JSON.stringify(payload));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

function loadSavedDataOrInit() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FORM);
    if (!raw) {
      // Initialize with default 5 subjects
      handleSemesterChange();
      renderCourseRows(5, false);
      return;
    }

    const data = JSON.parse(raw);

    // Restore Semester
    if (data.semester) {
      DOM.semesterSelect.value = data.semester;
    }
    handleSemesterChange();

    // Restore Previous Record
    if (data.prevCgpa !== undefined) DOM.prevCgpa.value = data.prevCgpa;
    if (data.prevCredits !== undefined) DOM.prevCredits.value = data.prevCredits;

    // Restore Course Count & Rows
    const count = parseInt(data.subjectCount, 10) || 5;
    DOM.subjectCount.value = count.toString();
    renderCourseRows(count, false, data.courses || []);

    // If it was calculated, we can re-evaluate silently if complete
    if (data.lastCalculated) {
      const validation = validateForm();
      if (validation.isValid) {
        const result = performCalculation();
        renderResults(result);
      }
    }
  } catch (err) {
    console.warn('LocalStorage restore error:', err);
    handleSemesterChange();
    renderCourseRows(5, false);
  }
}

/* ----------------------------------------------------------------------------
   13. Utility Helpers
   ---------------------------------------------------------------------------- */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
