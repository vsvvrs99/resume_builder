// script.js
// This file contains the core JavaScript logic for the Resume Generator.
// It manages the data model, listens for form input changes, and provides
// functions for adding/removing dynamic sections, real-time resume preview rendering,
// PDF generation, local storage persistence, form clearing, image handling,
// project reordering, and multiple resume templates.

/**
 * @global
 * @type {object}
 * @description The main data model for the resume, storing all user inputs.
 * Initialized with default empty values for all sections.
 * Now includes profileImage and github fields, and a currentTemplate for resume styling.
 * Also includes 'sectionOrder' for controlling the display order of major resume sections.
 */
let resumeData = {
    personal: {
        name: '',
        email: '',
        phone: '',
        linkedin: '',
        github: '', // New field for GitHub URL
        portfolio: '',
        profileImage: '' // Stores Base64 string of the uploaded image
    },
    summary: '',
    experience: [], // Array to hold multiple experience entries
    education: [],  // Array to hold multiple education entries
    skills: '',
    project: [],    // Array to hold multiple project entries
    currentTemplate: 'default', // Default template
    // Defines the default order of resume sections in the preview AND form
    // 'personal' is intentionally placed first and will be fixed.
    sectionOrder: ['personal', 'summary', 'experience', 'education', 'skills', 'project']
};

// Global counters for dynamic sections to ensure unique IDs and names for form fields
let experienceCounter = 0;
let educationCounter = 0;
let projectCounter = 0;

/**
 * @function updateResumeData
 * @description Updates the global resumeData object based on form input changes.
 * This function is intelligent enough to handle nested objects
 * and arrays (like experience, education, projects).
 * @param {HTMLInputElement|HTMLTextAreaElement} inputElement The input element that triggered the change.
 */
function updateResumeData(inputElement) {
    const name = inputElement.name;
    const value = inputElement.value;
    const type = inputElement.type;

    // Handle personal info, summary, and skills directly
    if (['name', 'email', 'phone', 'linkedin', 'github', 'portfolio'].includes(name)) {
        resumeData.personal[name] = value;
    } else if (name === 'summary') {
        resumeData.summary = value;
    } else if (name === 'skills') {
        resumeData.skills = value;
    }
    // Handle image file input separately
    else if (name === 'profileImage' && type === 'file') {
        const file = inputElement.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                resumeData.personal.profileImage = e.target.result;
                renderResumePreview();
                saveDataToLocalStorage();
            };
            reader.readAsDataURL(file); // Read file as Base64 Data URL
        } else {
            resumeData.personal.profileImage = ''; // Clear image if no file selected
            renderResumePreview();
            saveDataToLocalStorage();
        }
        return; // Exit early as image handling triggers its own render/save
    }
    // Handle array-based sections (experience, education, projects)
    // The name attribute uses a format like "experience[0].title"
    else if (name.startsWith('experience[') || name.startsWith('education[') || name.startsWith('project[')) {
        const parts = name.match(/(\w+)\[(\d+)\]\.(\w+)/); // Extracts section, index, and field
        if (parts) {
            const section = parts[1]; // e.g., 'experience'
            const index = parseInt(parts[2]); // e.g., 0
            const field = parts[3]; // e.g., 'title'

            // Ensure the array for the section exists and has enough elements
            while (resumeData[section].length <= index) {
                resumeData[section].push({}); // Add empty objects until the index is reachable
            }
            resumeData[section][index][field] = value;
        }
    }

    // After updating data, re-render the preview and save to local storage
    renderResumePreview();
    saveDataToLocalStorage();
}

/**
 * @function attachEventListeners
 * @description Attaches 'input' event listeners to all form elements within the resume form.
 * This ensures that any change in an input field triggers a data update.
 */
function attachEventListeners() {
    const resumeForm = document.getElementById('resume-form');
    if (resumeForm) {
        // Use 'input' event listener on the form itself, and delegate to children
        // This is more efficient than attaching a listener to every single input.
        resumeForm.addEventListener('input', (event) => {
            const target = event.target;
            // Check if the target is an input or textarea element (and not file input, which is handled separately)
            if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.type !== 'file') {
                updateResumeData(target);
            }
        });

        // Specific listener for file input (profile image)
        document.getElementById('profile-image')?.addEventListener('change', (event) => {
            updateResumeData(event.target);
        });

        // Event listeners for "Add New" buttons for dynamic entries
        document.getElementById('add-experience-btn')?.addEventListener('click', () => addSectionEntry('experience'));
        document.getElementById('add-education-btn')?.addEventListener('click', () => addSectionEntry('education'));
        document.getElementById('add-project-btn')?.addEventListener('click', () => addSectionEntry('project'));

        // Event listener for "Remove" buttons (for dynamic entries like experience/education/project items)
        resumeForm.addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-entry-btn')) {
                removeSectionEntry(event.target);
            }
            // Event listeners for "Move Up/Down" buttons for individual entries within sections
            if (event.target.classList.contains('move-up-btn')) {
                const entryElement = event.target.closest('[data-section]');
                const sectionType = entryElement.dataset.section;
                const index = parseInt(entryElement.dataset.index);
                moveEntry(index, 'up', sectionType);
            }
            if (event.target.classList.contains('move-down-btn')) {
                const entryElement = event.target.closest('[data-section]');
                const sectionType = entryElement.dataset.section;
                const index = parseInt(entryElement.dataset.index);
                moveEntry(index, 'down', sectionType);
            }

            // Event listeners for "Move Up/Down" buttons for entire sections
            if (event.target.classList.contains('move-section-up-btn')) {
                const sectionId = event.target.dataset.sectionId;
                moveResumeSection(sectionId, 'up');
            }
            if (event.target.classList.contains('move-section-down-btn')) {
                const sectionId = event.target.dataset.sectionId;
                moveResumeSection(sectionId, 'down');
            }
        });

        // Event listener for the "Download PDF" button
        document.getElementById('download-pdf-btn')?.addEventListener('click', downloadResumeAsPdf);

        // Event listener for the "Clear All" button
        document.getElementById('clear-all-btn')?.addEventListener('click', clearAllData);

        // Event listeners for template selection buttons
        document.querySelectorAll('.template-select-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const template = event.target.dataset.template;
                if (template) {
                    switchTemplate(template);
                }
            });
        });

    } else {
        console.error('Error: Resume form not found. Check if an element with ID "resume-form" exists.');
    }
}

/**
 * @function createExperienceEntryHtml
 * @description Generates the HTML string for a new experience entry form.
 * @param {number} index The index for the new entry, used for unique IDs and names.
 * @param {object} [data={}] Optional: Pre-fill data for the new entry.
 * @param {number} totalEntries The total number of entries in this section, for button disabling.
 * @returns {string} The HTML string for the experience entry.
 */
function createExperienceEntryHtml(index, data = {}, totalEntries = 0) {
    const isFirst = index === 0;
    const isLast = index === totalEntries - 1;

    return `
        <div class="experience-entry p-4 border border-gray-200 rounded-md bg-gray-50 relative" data-index="${index}" data-section="experience">
            <h3 class="text-lg font-semibold text-gray-700 mb-3">Job Entry ${index + 1}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="job-title-${index}" class="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                    <input type="text" id="job-title-${index}" name="experience[${index}].title" placeholder="Software Engineer" value="${data.title || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
                <div>
                    <label for="company-${index}" class="block text-sm font-medium text-gray-700 mb-1">Company</label>
                    <input type="text" id="company-${index}" name="experience[${index}].company" placeholder="Tech Solutions Inc." value="${data.company || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
                <div>
                    <label for="start-date-${index}" class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input type="month" id="start-date-${index}" name="experience[${index}].startDate" value="${data.startDate || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
                <div>
                    <label for="end-date-${index}" class="block text-sm font-medium text-gray-700 mb-1">End Date (or Present)</label>
                    <input type="month" id="end-date-${index}" name="experience[${index}].endDate" value="${data.endDate || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
                <div class="md:col-span-2">
                    <label for="responsibilities-${index}" class="block text-sm font-medium text-gray-700 mb-1">Responsibilities (one per line)</label>
                    <textarea id="responsibilities-${index}" name="experience[${index}].responsibilities" rows="4" placeholder="- Developed and maintained web applications
- Collaborated with cross-functional teams" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">${data.responsibilities || ''}</textarea>
                </div>
            </div>
            <div class="absolute top-2 right-2 flex space-x-1">
                <button type="button" class="move-up-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded ${isFirst ? 'opacity-50 cursor-not-allowed' : ''}" ${isFirst ? 'disabled' : ''} title="Move Up">&#9650;</button>
                <button type="button" class="move-down-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded ${isLast ? 'opacity-50 cursor-not-allowed' : ''}" ${isLast ? 'disabled' : ''} title="Move Down">&#9660;</button>
                <button type="button" class="remove-entry-btn text-red-500 hover:text-red-700 text-lg font-bold p-1 rounded" title="Remove">&times;</button>
            </div>
        </div>
    `;
}

/**
 * @function createEducationEntryHtml
 * @description Generates the HTML string for a new education entry form.
 * @param {number} index The index for the new entry, used for unique IDs and names.
 * @param {object} [data={}] Optional: Pre-fill data for the new entry.
 * @param {number} totalEntries The total number of entries in this section, for button disabling.
 * @returns {string} The HTML string for the education entry.
 */
function createEducationEntryHtml(index, data = {}, totalEntries = 0) {
    const isFirst = index === 0;
    const isLast = index === totalEntries - 1;

    return `
        <div class="education-entry p-4 border border-gray-200 rounded-md bg-gray-50 relative" data-index="${index}" data-section="education">
            <h3 class="text-lg font-semibold text-gray-700 mb-3">Education Entry ${index + 1}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label for="degree-${index}" class="block text-sm font-medium text-gray-700 mb-1">Degree/Field of Study</label>
                    <input type="text" id="degree-${index}" name="education[${index}].degree" placeholder="B.Sc. Computer Science" value="${data.degree || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
                <div>
                    <label for="university-${index}" class="block text-sm font-medium text-gray-700 mb-1">University/Institution</label>
                    <input type="text" id="university-${index}" name="education[${index}].university" placeholder="State University" value="${data.university || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
                <div>
                    <label for="edu-start-date-${index}" class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input type="month" id="edu-start-date-${index}" name="education[${index}].startDate" value="${data.startDate || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
                <div>
                    <label for="edu-end-date-${index}" class="block text-sm font-medium text-gray-700 mb-1">End Date (or Expected)</label>
                    <input type="month" id="edu-end-date-${index}" name="education[${index}].endDate" value="${data.endDate || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
            </div>
            <div class="absolute top-2 right-2 flex space-x-1">
                <button type="button" class="move-up-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded ${isFirst ? 'opacity-50 cursor-not-allowed' : ''}" ${isFirst ? 'disabled' : ''} title="Move Up">&#9650;</button>
                <button type="button" class="move-down-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded ${isLast ? 'opacity-50 cursor-not-allowed' : ''}" ${isLast ? 'disabled' : ''} title="Move Down">&#9660;</button>
                <button type="button" class="remove-entry-btn text-red-500 hover:text-red-700 text-lg font-bold p-1 rounded" title="Remove">&times;</button>
            </div>
        </div>
    `;
}

/**
 * @function createProjectEntryHtml
 * @description Generates the HTML string for a new project entry form.
 * Includes move up/down buttons.
 * @param {number} index The index for the new entry, used for unique IDs and names.
 * @param {object} [data={}] Optional: Pre-fill data for the new entry.
 * @param {number} totalEntries The total number of project entries, for button disabling.
 * @returns {string} The HTML string for the project entry.
 */
function createProjectEntryHtml(index, data = {}, totalEntries = 0) {
    const isFirst = index === 0;
    const isLast = index === totalEntries - 1;

    return `
        <div class="project-entry p-4 border border-gray-200 rounded-md bg-gray-50 relative" data-index="${index}" data-section="project">
            <h3 class="text-lg font-semibold text-gray-700 mb-3">Project Entry ${index + 1}</h3>
            <div class="grid grid-cols-1 gap-4">
                <div>
                    <label for="project-name-${index}" class="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                    <input type="text" id="project-name-${index}" name="project[${index}].name" placeholder="Personal Portfolio Website" value="${data.name || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
                <div>
                    <label for="project-url-${index}" class="block text-sm font-medium text-gray-700 mb-1">Project URL (Optional)</label>
                    <input type="url" id="project-url-${index}" name="project[${index}].url" placeholder="https://github.com/yourusername/portfolio" value="${data.url || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                </div>
                <div>
                    <label for="project-description-${index}" class="block text-sm font-medium text-gray-700 mb-1">Description (one per line)</label>
                    <textarea id="project-description-${index}" name="project[${index}].description" rows="3" placeholder="- Developed a responsive portfolio using React and Tailwind CSS
- Showcased various personal projects and skills" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">${data.description || ''}</textarea>
                </div>
            </div>
            <div class="absolute top-2 right-2 flex space-x-1">
                <button type="button" class="move-up-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded ${isFirst ? 'opacity-50 cursor-not-allowed' : ''}" ${isFirst ? 'disabled' : ''} title="Move Up">&#9650;</button>
                <button type="button" class="move-down-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded ${isLast ? 'opacity-50 cursor-not-allowed' : ''}" ${isLast ? 'disabled' : ''} title="Move Down">&#9660;</button>
                <button type="button" class="remove-entry-btn text-red-500 hover:text-red-700 text-lg font-bold p-1 rounded" title="Remove">&times;</button>
            </div>
        </div>
    `;
}

/**
 * @function addSectionEntry
 * @description Adds a new entry (Experience, Education, or Project) to the form.
 * It appends new HTML fields and increments the corresponding counter.
 * @param {string} sectionType The type of section to add ('experience', 'education', 'project').
 * @param {object} [data={}] Optional: Pre-fill data for the new entry.
 * @param {boolean} [suppressRender=false] If true, will not trigger render/save immediately.
 */
function addSectionEntry(sectionType, data = {}, suppressRender = false) {
    let newEntryHtml;
    let containerElement;
    let currentIndex;
    let totalEntries;

    switch (sectionType) {
        case 'experience':
            currentIndex = experienceCounter;
            totalEntries = resumeData.experience.length + 1;
            newEntryHtml = createExperienceEntryHtml(currentIndex, data, totalEntries);
            containerElement = document.getElementById('experience-entries');
            experienceCounter++;
            break;
        case 'education':
            currentIndex = educationCounter;
            totalEntries = resumeData.education.length + 1;
            newEntryHtml = createEducationEntryHtml(currentIndex, data, totalEntries);
            containerElement = document.getElementById('education-entries');
            educationCounter++;
            break;
        case 'project':
            currentIndex = projectCounter;
            totalEntries = resumeData.project.length + 1;
            newEntryHtml = createProjectEntryHtml(currentIndex, data, totalEntries);
            containerElement = document.getElementById('project-entries');
            projectCounter++;
            break;
        default:
            console.error('Unknown section type:', sectionType);
            return;
    }

    if (containerElement) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newEntryHtml.trim();
        const newEntryElement = tempDiv.firstChild;

        containerElement.appendChild(newEntryElement);

        // If this is a new entry not loaded from storage, add an empty object to resumeData
        if (Object.keys(data).length === 0) {
            while (resumeData[sectionType].length <= currentIndex) {
                resumeData[sectionType].push({});
            }
        }
        if (!suppressRender) {
            // Reindex after adding to ensure correct button states for all entries in that section
            reindexFormSection(sectionType);
            renderResumePreview();
            saveDataToLocalStorage();
        }
    }
}

/**
 * @function removeSectionEntry
 * @description Removes a dynamic entry from the form and updates the resumeData.
 * @param {HTMLElement} removeButton The "Remove" button that was clicked.
 */
function removeSectionEntry(removeButton) {
    const entryElement = removeButton.closest('[data-section]'); // Find the parent element with data-section
    if (entryElement) {
        const sectionType = entryElement.dataset.section;
        const indexToRemove = parseInt(entryElement.dataset.index);

        // Remove the entry from the DOM
        entryElement.remove();

        // Remove the corresponding data from resumeData array
        if (resumeData[sectionType] && resumeData[sectionType].length > indexToRemove) {
            resumeData[sectionType].splice(indexToRemove, 1);
        }

        // Re-index remaining entries in the form and in resumeData to prevent gaps
        reindexFormSection(sectionType);
    }
}

/**
 * @function moveEntry
 * @description Moves an entry (experience, education, or project) up or down in the list.
 * @param {number} index The current index of the entry to move.
 * @param {string} direction 'up' or 'down'.
 * @param {string} sectionType The type of section ('experience', 'education', 'project').
 */
function moveEntry(index, direction, sectionType) {
    const sectionArray = resumeData[sectionType];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex >= 0 && newIndex < sectionArray.length) {
        // Swap elements in the array
        const [movedEntry] = sectionArray.splice(index, 1);
        sectionArray.splice(newIndex, 0, movedEntry);

        // Update resumeData (this modifies the reference directly)
        resumeData[sectionType] = sectionArray;

        // Re-render the form section for the specific type to update HTML and button states
        reindexFormSection(sectionType);
    }
}


/**
 * @function reindexFormSection
 * @description Re-indexes the form elements for a given section after an item has been removed or reordered.
 * This updates IDs, names, and data-index attributes, and rebuilds the resumeData array.
 * Crucially, it regenerates the HTML for dynamic sections to ensure button states are correct.
 * @param {string} sectionType The type of section to re-index ('experience', 'education', 'project').
 */
function reindexFormSection(sectionType) {
    const container = document.getElementById(`${sectionType}-entries`);
    if (!container) return;

    const currentSectionData = [...resumeData[sectionType]]; // Get a copy of the current section data
    container.innerHTML = ''; // Clear existing DOM elements

    // Reset the counter for the specific section before re-populating to ensure correct indexing
    switch (sectionType) {
        case 'experience':
            experienceCounter = 0;
            break;
        case 'education':
            educationCounter = 0;
            break;
        case 'project':
            projectCounter = 0;
            break;
    }

    // Re-add each entry from the updated data array
    currentSectionData.forEach((entryData, newIndex) => {
        const totalEntries = currentSectionData.length;
        let newEntryHtml;
        switch (sectionType) {
            case 'experience':
                newEntryHtml = createExperienceEntryHtml(newIndex, entryData, totalEntries);
                experienceCounter++;
                break;
            case 'education':
                newEntryHtml = createEducationEntryHtml(newIndex, entryData, totalEntries);
                educationCounter++;
                break;
            case 'project':
                newEntryHtml = createProjectEntryHtml(newIndex, entryData, totalEntries);
                projectCounter++;
                break;
        }
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newEntryHtml.trim();
        container.appendChild(tempDiv.firstChild);
    });

    // Always re-render and save after any re-indexing activity
    renderResumePreview();
    saveDataToLocalStorage();
}

/**
 * @function getSectionFormHtml
 * @description Returns the complete HTML string for a given form section.
 * This helps in dynamically rebuilding the form when sections are reordered.
 * @param {string} sectionId The ID of the section (e.g., 'summary', 'experience').
 * @param {object} data The current resumeData.
 * @returns {string} The HTML string for the section's form.
 */
function getSectionFormHtml(sectionId, data) {
    const formHtmlMap = {
        'personal': `
            <div id="personal-info-section-form" class="bg-white p-6 rounded-lg shadow-md border border-gray-200" data-section-id="personal">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex justify-between items-center">
                    Personal Information
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="name" class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input type="text" id="name" name="name" placeholder="John Doe" value="${data.personal.name || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    </div>
                    <div>
                        <label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" id="email" name="email" placeholder="john.doe@example.com" value="${data.personal.email || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    </div>
                    <div>
                        <label for="phone" class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input type="tel" id="phone" name="phone" placeholder="(123) 456-7890" value="${data.personal.phone || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    </div>
                    <div>
                        <label for="linkedin" class="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
                        <input type="url" id="linkedin" name="linkedin" placeholder="https://linkedin.com/in/johndoe" value="${data.personal.linkedin || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    </div>
                    <div>
                        <label for="github" class="block text-sm font-medium text-gray-700 mb-1">GitHub URL</label>
                        <input type="url" id="github" name="github" placeholder="https://github.com/yourusername" value="${data.personal.github || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    </div>
                    <div class="md:col-span-2">
                        <label for="portfolio" class="block text-sm font-medium text-gray-700 mb-1">Portfolio/Website URL</label>
                        <input type="url" id="portfolio" name="portfolio" placeholder="https://johndoe.com" value="${data.personal.portfolio || ''}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    </div>
                    <div class="md:col-span-2">
                        <label for="profile-image" class="block text-sm font-medium text-gray-700 mb-1">Profile Image</label>
                        <input type="file" id="profile-image" name="profileImage" accept="image/*" class="mt-1 block w-full text-sm text-gray-500
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-md file:border-0
                            file:text-sm file:font-semibold
                            file:bg-blue-50 file:text-blue-700
                            hover:file:bg-blue-100">
                        <p class="mt-1 text-xs text-gray-500">Upload a professional headshot. Max size 2MB.</p>
                    </div>
                </div>
            </div>
        `,
        'summary': `
            <div id="summary-section-form" class="bg-white p-6 rounded-lg shadow-md border border-gray-200" data-section-id="summary">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex justify-between items-center">
                    Summary / Objective
                    <div class="section-move-btns space-x-1">
                        <button type="button" class="move-section-up-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="summary" title="Move Section Up">&#9650;</button>
                        <button type="button" class="move-section-down-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="summary" title="Move Section Down">&#9660;</button>
                    </div>
                </h2>
                <div>
                    <label for="summary" class="block text-sm font-medium text-gray-700 mb-1">Briefly describe yourself and your career goals.</label>
                    <textarea id="summary" name="summary" rows="4" placeholder="Highly motivated and detail-oriented professional seeking to leverage skills in..." class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">${data.summary || ''}</textarea>
                </div>
            </div>
        `,
        'experience': `
            <div id="experience-section-form" class="bg-white p-6 rounded-lg shadow-md border border-gray-200" data-section-id="experience">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex justify-between items-center">
                    Work Experience
                    <div class="section-move-btns space-x-1">
                        <button type="button" class="move-section-up-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="experience" title="Move Section Up">&#9650;</button>
                        <button type="button" class="move-section-down-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="experience" title="Move Section Down">&#9660;</button>
                    </div>
                </h2>
                <div id="experience-entries" class="space-y-6">
                    <!-- Experience entries will be dynamically added here by JS -->
                </div>
                <button type="button" id="add-experience-btn" class="mt-4 w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Add New Experience</button>
            </div>
        `,
        'education': `
            <div id="education-section-form" class="bg-white p-6 rounded-lg shadow-md border border-gray-200" data-section-id="education">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex justify-between items-center">
                    Education
                    <div class="section-move-btns space-x-1">
                        <button type="button" class="move-section-up-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="education" title="Move Section Up">&#9650;</button>
                        <button type="button" class="move-section-down-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="education" title="Move Section Down">&#9660;</button>
                    </div>
                </h2>
                <div id="education-entries" class="space-y-6">
                    <!-- Education entries will be dynamically added here by JS -->
                </div>
                <button type="button" id="add-education-btn" class="mt-4 w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Add New Education</button>
            </div>
        `,
        'skills': `
            <div id="skills-section-form" class="bg-white p-6 rounded-lg shadow-md border border-gray-200" data-section-id="skills">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex justify-between items-center">
                    Skills
                    <div class="section-move-btns space-x-1">
                        <button type="button" class="move-section-up-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="skills" title="Move Section Up">&#9650;</button>
                        <button type="button" class="move-section-down-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="skills" title="Move Section Down">&#9660;</button>
                    </div>
                </h2>
                <div>
                    <label for="skills" class="block text-sm font-medium text-gray-700 mb-1">List your skills, separated by commas (e.g., JavaScript, React, Node.js)</label>
                    <textarea id="skills" name="skills" rows="3" placeholder="JavaScript, React, Node.js, HTML, CSS, SQL, Git, AWS" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">${data.skills || ''}</textarea>
                </div>
            </div>
        `,
        'project': `
            <div id="project-section-form" class="bg-white p-6 rounded-lg shadow-md border border-gray-200" data-section-id="project">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex justify-between items-center">
                    Projects
                    <div class="section-move-btns space-x-1">
                        <button type="button" class="move-section-up-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="project" title="Move Section Up">&#9650;</button>
                        <button type="button" class="move-section-down-btn text-gray-500 hover:text-gray-700 text-sm font-bold p-1 rounded" data-section-id="project" title="Move Section Down">&#9660;</button>
                    </div>
                </h2>
                <div id="project-entries" class="space-y-6">
                    <!-- Project entries will be dynamically added here by JS -->
                </div>
                <button type="button" id="add-project-btn" class="mt-4 w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Add New Project</button>
            </div>
        `
    };
    return formHtmlMap[sectionId] || '';
}


/**
 * @function moveResumeSection
 * @description Moves an entire resume section up or down in the sectionOrder.
 * Triggers reordering of the actual DOM elements in the form.
 * @param {string} sectionId The ID of the section to move (e.g., 'summary', 'experience').
 * @param {string} direction 'up' or 'down'.
 */
function moveResumeSection(sectionId, direction) {
    const currentOrder = resumeData.sectionOrder;
    const oldIndex = currentOrder.indexOf(sectionId);

    if (oldIndex === -1) {
        console.error(`Section with ID '${sectionId}' not found in sectionOrder.`);
        return;
    }

    let newIndex = oldIndex;
    if (direction === 'up') {
        newIndex--;
    } else if (direction === 'down') {
        newIndex++;
    }

    // 'personal' section is fixed at the very top and cannot be moved
    if (sectionId === 'personal') return;

    // The 'personal' section is always expected to be the first in sectionOrder (index 0).
    // Therefore, other sections cannot move into index 0.
    const minMovableIndex = 1;

    // Ensure the new index is within valid bounds for movable sections
    if (newIndex >= minMovableIndex && newIndex < currentOrder.length) {
        // Perform the swap in the sectionOrder array
        const [movedSection] = currentOrder.splice(oldIndex, 1);
        currentOrder.splice(newIndex, 0, movedSection);

        resumeData.sectionOrder = currentOrder; // Update the order in resumeData
        reorderFormSections(); // Re-order the actual DOM elements in the form
        renderResumePreview(); // Re-render the entire preview
        saveDataToLocalStorage(); // Save the new order
    }
}

/**
 * @function updateSectionMoveButtonStates
 * @description Updates the disabled state of section move buttons in the form.
 */
function updateSectionMoveButtonStates() {
    const sectionOrder = resumeData.sectionOrder;
    const minMovableIndex = sectionOrder.indexOf('personal') + 1; // Sections from this index onwards are movable

    document.querySelectorAll('.section-move-btns button').forEach(button => {
        const sectionId = button.dataset.sectionId;
        const index = sectionOrder.indexOf(sectionId);

        // If 'personal' section, disable both buttons as it's fixed
        if (sectionId === 'personal') {
            button.disabled = true;
            button.classList.add('opacity-50', 'cursor-not-allowed');
            return; // Exit for personal section buttons
        }

        if (button.classList.contains('move-section-up-btn')) {
            // Disable if it's the first movable section (or below personal if personal is 0)
            if (index <= minMovableIndex) {
                button.disabled = true;
                button.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                button.disabled = false;
                button.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        } else if (button.classList.contains('move-section-down-btn')) {
            // Disable if it's the last section in the order
            if (index >= sectionOrder.length - 1) {
                button.disabled = true;
                button.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                button.disabled = false;
                button.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
    });
}


/**
 * @function renderResumePreview
 * @description Renders the current state of the resumeData object into the live preview pane.
 * It dynamically updates personal information, summary, skills, and iterates through
 * experience, education, and projects arrays to create and append their respective HTML elements.
 * Also handles profile image and template-specific styling.
 * Now renders sections based on `resumeData.sectionOrder` and handles optional sections.
 */
function renderResumePreview() {
    console.log('Resume Data Updated:', resumeData);

    const resumePreviewContent = document.getElementById('resume-preview-content');
    if (!resumePreviewContent) {
        console.error('Resume preview content container not found.');
        return;
    }

    // Apply current template class
    resumePreviewContent.classList.remove('template-default', 'template-modern', 'template-minimalist');
    resumePreviewContent.classList.add(`template-${resumeData.currentTemplate}`);

    // Clear existing content to re-render based on section order
    resumePreviewContent.innerHTML = '';

    // Render sections based on the sectionOrder array
    resumeData.sectionOrder.forEach(sectionId => {
        let sectionHtml = '';
        let shouldRender = true; // Flag to determine if a section should be rendered

        switch (sectionId) {
            case 'personal':
                sectionHtml = `
                    <section id="preview-personal-info" class="mb-6 pb-2 border-b border-gray-300 flex items-center">
                        <img id="preview-profile-image" src="${resumeData.personal.profileImage || 'https://placehold.co/100x100/e2e8f0/64748b?text=Photo'}" alt="Profile Photo" class="w-24 h-24 rounded-full mr-4 object-cover border-2 border-gray-200 ${resumeData.personal.profileImage ? '' : 'hidden'}">
                        <div>
                            <h2 id="preview-name" class="text-3xl font-bold text-gray-900 mb-1">${resumeData.personal.name || 'Your Name'}</h2>
                            <p class="text-sm text-gray-600 flex flex-wrap gap-x-2">
                                <span id="preview-email" class="inline-flex items-center">${resumeData.personal.email ? `<i class="fas fa-envelope mr-1"></i> ${resumeData.personal.email}` : ''}</span>
                                <span id="preview-phone" class="inline-flex items-center">${resumeData.personal.phone ? `<i class="fas fa-phone mr-1"></i> ${resumeData.personal.phone}` : ''}</span>
                                ${resumeData.personal.linkedin ? `<a id="preview-linkedin" href="${resumeData.personal.linkedin}" target="_blank" class="text-blue-600 hover:underline inline-flex items-center"><i class="fab fa-linkedin mr-1"></i> LinkedIn</a>` : ''}
                                ${resumeData.personal.github ? `<a id="preview-github" href="${resumeData.personal.github}" target="_blank" class="text-blue-600 hover:underline inline-flex items-center"><i class="fab fa-github mr-1"></i> GitHub</a>` : ''}
                                ${resumeData.personal.portfolio ? `<a id="preview-portfolio" href="${resumeData.personal.portfolio}" target="_blank" class="text-blue-600 hover:underline inline-flex items-center"><i class="fas fa-globe mr-1"></i> Portfolio</a>` : ''}
                            </p>
                        </div>
                    </section>
                `;
                break;
            case 'summary':
                if (!resumeData.summary.trim()) {
                    shouldRender = false; // Hide if empty
                } else {
                    sectionHtml = `
                        <section id="preview-summary" class="mb-6">
                            <h3 class="text-xl font-bold text-gray-800 mb-2">Summary</h3>
                            <p id="preview-summary-text" class="text-gray-700 leading-relaxed">${resumeData.summary}</p>
                        </section>
                    `;
                }
                break;
            case 'experience':
                const filteredExperience = resumeData.experience.filter(exp =>
                    exp.title || exp.company || exp.startDate || exp.endDate || exp.responsibilities
                );
                if (filteredExperience.length === 0) {
                    shouldRender = false; // Hide if no entries
                } else {
                    let experienceListHtml = '';
                    filteredExperience.forEach(exp => {
                        const responsibilitiesHtml = exp.responsibilities ?
                            `<ul class="list-disc list-inside text-gray-700 ml-4 space-y-1">` +
                            exp.responsibilities.split('\n').map(res => {
                                const trimmedRes = res.trim();
                                return trimmedRes ? `<li>${trimmedRes}</li>` : '';
                            }).filter(Boolean).join('') + `</ul>`
                            : '';
                        experienceListHtml += `
                            <div class="mb-4">
                                <h4 class="text-lg font-semibold text-gray-800">
                                    ${exp.title || ''}${exp.title && exp.company ? ', ' : ''}${exp.company || ''}
                                </h4>
                                <p class="text-sm text-gray-600 mb-1">${exp.startDate || ''}${exp.startDate && exp.endDate ? ' - ' : ''}${exp.endDate || ''}</p>
                                ${responsibilitiesHtml}
                            </div>
                        `;
                    });
                    sectionHtml = `
                        <section id="preview-experience" class="mb-6">
                            <h3 class="text-xl font-bold text-gray-800 mb-2 pb-1 border-b border-gray-200">Experience</h3>
                            <div id="preview-experience-list" class="space-y-4">${experienceListHtml}</div>
                        </section>
                    `;
                }
                break;
            case 'education':
                const filteredEducation = resumeData.education.filter(edu =>
                    edu.degree || edu.university || edu.startDate || edu.endDate
                );
                if (filteredEducation.length === 0) {
                    shouldRender = false; // Hide if no entries
                } else {
                    let educationListHtml = '';
                    filteredEducation.forEach(edu => {
                        educationListHtml += `
                            <div class="mb-4">
                                <h4 class="text-lg font-semibold text-gray-800">${edu.degree || ''}</h4>
                                <p class="text-base text-gray-700">${edu.university || ''}</p>
                                <p class="text-sm text-gray-600">${edu.startDate || ''}${edu.startDate && edu.endDate ? ' - ' : ''}${edu.endDate || ''}</p>
                            </div>
                        `;
                    });
                    sectionHtml = `
                        <section id="preview-education" class="mb-6">
                            <h3 class="text-xl font-bold text-gray-800 mb-2 pb-1 border-b border-gray-200">Education</h3>
                            <div id="preview-education-list" class="space-y-4">${educationListHtml}</div>
                        </section>
                    `;
                }
                break;
            case 'skills':
                if (!resumeData.skills.trim()) {
                    shouldRender = false; // Hide if empty
                } else {
                    const formattedSkills = resumeData.skills.split(',').map(skill => skill.trim()).filter(Boolean).join(', ');
                    sectionHtml = `
                        <section id="preview-skills" class="mb-6">
                            <h3 class="text-xl font-bold text-gray-800 mb-2 pb-1 border-b border-gray-200">Skills</h3>
                            <p id="preview-skills-text" class="text-gray-700">${formattedSkills}</p>
                        </section>
                    `;
                }
                break;
            case 'project':
                const filteredProjects = resumeData.project.filter(proj =>
                    proj.name || proj.url || proj.description
                );
                if (filteredProjects.length === 0) {
                    shouldRender = false; // Hide if no entries
                } else {
                    let projectListHtml = '';
                    filteredProjects.forEach(proj => {
                        const descriptionHtml = proj.description ?
                            `<ul class="list-disc list-inside text-gray-700 ml-4 space-y-1">` +
                            proj.description.split('\n').map(desc => {
                                const trimmedDesc = desc.trim();
                                return trimmedDesc ? `<li>${trimmedDesc}</li>` : '';
                            }).filter(Boolean).join('') + `</ul>`
                            : '';
                        projectListHtml += `
                            <div class="mb-4">
                                <h4 class="text-lg font-semibold text-gray-800">${proj.name || ''}</h4>
                                ${proj.url ? `<p class="text-sm text-blue-600 hover:underline mb-1"><a href="${proj.url}" target="_blank">${proj.url}</a></p>` : ''}
                                ${descriptionHtml}
                            </div>
                        `;
                    });
                    sectionHtml = `
                        <section id="preview-projects" class="mb-6">
                            <h3 class="text-xl font-bold text-gray-800 mb-2 pb-1 border-b border-gray-200">Projects</h3>
                            <div id="preview-projects-list" class="space-y-4">${projectListHtml}</div>
                        </section>
                    `;
                }
                break;
        }

        if (shouldRender && sectionHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = sectionHtml.trim();
            resumePreviewContent.appendChild(tempDiv.firstChild);
        }
    });
    // Ensure the profile image visibility is correct when re-rendering personal info
    const previewProfileImage = document.getElementById('preview-profile-image');
    if (previewProfileImage) {
        if (resumeData.personal.profileImage) {
            previewProfileImage.classList.remove('hidden');
        } else {
            previewProfileImage.classList.add('hidden');
        }
    }
}


/**
 * @function downloadResumeAsPdf
 * @description Generates a PDF of the resume preview content and triggers a download.
 * Shows a loading indicator during the process.
 */
async function downloadResumeAsPdf() {
    const element = document.getElementById('resume-preview-content');
    const downloadBtn = document.getElementById('download-pdf-btn');
    const loadingIndicator = document.getElementById('pdf-loading-indicator');

    if (!element || !downloadBtn || !loadingIndicator) {
        console.error('Required elements for PDF generation not found.');
        return;
    }

    // Hide download button and show loading indicator
    downloadBtn.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');
    loadingIndicator.classList.add('flex'); // Use flex to center text

    try {
        // Generate a filename based on the user's name, or a default
        const fileName = (resumeData.personal.name ? resumeData.personal.name.replace(/\s/g, '_') : 'resume') + '.pdf';

        // Options for html2pdf.js
        const options = {
            margin: [0.2, 0.2, 0.2, 0.2], // Top, Left, Bottom, Right margins in inches
            filename: fileName,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true }, // Scale for better resolution, useCORS if images are involved
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        // Use html2pdf to generate and save the PDF
        await html2pdf().from(element).set(options).save();

    } catch (error) {
        console.error('Error generating PDF:', error);
        // Optionally, show an error message to the user
    } finally {
        // Hide loading indicator and show download button again
        loadingIndicator.classList.add('hidden');
        loadingIndicator.classList.remove('flex');
        downloadBtn.classList.remove('hidden');
    }
}

/**
 * @function saveDataToLocalStorage
 * @description Saves the current resumeData object to local storage.
 */
function saveDataToLocalStorage() {
    try {
        localStorage.setItem('resumeGeneratorData', JSON.stringify(resumeData));
        console.log('Resume data saved to local storage.');
    } catch (e) {
        console.error('Error saving to local storage:', e);
    }
}

/**
 * @function loadDataFromLocalStorage
 * @description Loads resumeData from local storage and populates the form and preview.
 */
function loadDataFromLocalStorage() {
    try {
        const storedData = localStorage.getItem('resumeGeneratorData');
        if (storedData) {
            const parsedData = JSON.parse(storedData);
            // Ensure 'sectionOrder' exists; if not, initialize with default
            if (!parsedData.sectionOrder || parsedData.sectionOrder.length === 0) {
                parsedData.sectionOrder = ['personal', 'summary', 'experience', 'education', 'skills', 'project'];
            }
            resumeData = parsedData;
            console.log('Resume data loaded from local storage.');
            populateFormFromData(); // Populate the form fields with loaded data
            renderResumePreview();  // Render the preview with loaded data
        } else {
             // If no data loaded, ensure initial empty sections are added and form is built
            addSectionEntry('experience', {}, true);
            addSectionEntry('education', {}, true);
            addSectionEntry('project', {}, true);
            populateFormFromData(); // Call this to build the form initially
            renderResumePreview(); // Render once after adding initial empty sections
            saveDataToLocalStorage(); // Save the initial empty state
        }
    } catch (e) {
        console.error('Error loading from local storage or parsing data:', e);
    }
}

/**
 * @function populateFormFromData
 * @description Populates the form fields based on the current resumeData object.
 * This is crucial for loading data from local storage into the interactive form,
 * and for reordering sections in the form.
 */
function populateFormFromData() {
    const resumeForm = document.getElementById('resume-form');
    if (!resumeForm) {
        console.error('Resume form not found during populateFormFromData.');
        return;
    }

    // Manually populate non-dynamic fields first, as their elements are persistent
    document.getElementById('name').value = resumeData.personal.name || '';
    document.getElementById('email').value = resumeData.personal.email || '';
    document.getElementById('phone').value = resumeData.personal.phone || '';
    document.getElementById('linkedin').value = resumeData.personal.linkedin || '';
    document.getElementById('github').value = resumeData.personal.github || '';
    document.getElementById('portfolio').value = resumeData.personal.portfolio || '';
    document.getElementById('summary').value = resumeData.summary || '';
    document.getElementById('skills').value = resumeData.skills || '';

    // Note: File inputs cannot be programmatically set for security reasons.
    // The image will appear in the preview, but the input field will always be empty after load/re-render.


    // Clear existing dynamic entries containers (experience, education, project lists)
    document.getElementById('experience-entries').innerHTML = '';
    document.getElementById('education-entries').innerHTML = '';
    document.getElementById('project-entries').innerHTML = '';

    // Reset counters before populating dynamic entries
    experienceCounter = 0;
    educationCounter = 0;
    projectCounter = 0;

    // Populate dynamic sections with existing data or add a default empty one
    if (resumeData.experience && resumeData.experience.length > 0) {
        resumeData.experience.forEach(exp => addSectionEntry('experience', exp, true));
    } else {
        addSectionEntry('experience', {}, true);
    }
    if (resumeData.education && resumeData.education.length > 0) {
        resumeData.education.forEach(edu => addSectionEntry('education', edu, true));
    } else {
        addSectionEntry('education', {}, true);
    }
    if (resumeData.project && resumeData.project.length > 0) {
        resumeData.project.forEach(proj => addSectionEntry('project', proj, true));
    } else {
        addSectionEntry('project', {}, true);
    }

    // After populating dynamic entries, ensure their internal move buttons are correct
    reindexFormSection('experience');
    reindexFormSection('education');
    reindexFormSection('project');

    // Reorder the main form sections based on resumeData.sectionOrder
    reorderFormSections();

    // Update template selection buttons
    updateTemplateSelectionButtons();

    // Update section move buttons state after reordering the form
    updateSectionMoveButtonStates();
}

/**
 * @function reorderFormSections
 * @description Reorders the main section DIV elements within the resume form
 * based on the `resumeData.sectionOrder` array.
 * This preserves the state of inputs within each section.
 */
function reorderFormSections() {
    const resumeForm = document.getElementById('resume-form');
    if (!resumeForm) {
        console.error('Resume form not found for reordering sections.');
        return;
    }

    // Get references to all main section DOM elements and the action buttons
    // Filter out sections that might not exist in the DOM yet for some reason
    const sectionsInCurrentDomOrder = Array.from(resumeForm.children).filter(child =>
        child.tagName === 'DIV' && child.id.endsWith('-section-form') || child.classList.contains('bg-white') && child.classList.contains('flex-col')
    );

    // Create a map of sectionId to its current DOM element
    const sectionElementMap = new Map();
    sectionsInCurrentDomOrder.forEach(element => {
        if (element.dataset.sectionId) {
            sectionElementMap.set(element.dataset.sectionId, element);
        } else if (element.classList.contains('bg-white') && element.classList.contains('flex-col')) {
            // This is the action buttons div, give it a temporary ID to map
            sectionElementMap.set('action-buttons', element);
        }
    });

    // Detach all relevant sections and action buttons from the form to re-append in order
    sectionsInCurrentDomOrder.forEach(element => {
        if (element.parentNode === resumeForm) { // Ensure it's still a child before trying to remove
            resumeForm.removeChild(element);
        }
    });

    // Append sections back in the new order, including 'action-buttons' if it exists in the order
    resumeData.sectionOrder.forEach(sectionId => {
        const sectionElement = sectionElementMap.get(sectionId);
        if (sectionElement) {
            resumeForm.appendChild(sectionElement);
        }
    });

    // Ensure action buttons are always at the very end
    const actionButtonsElement = sectionElementMap.get('action-buttons');
    if (actionButtonsElement && actionButtonsElement.parentNode !== resumeForm.lastChild) {
        resumeForm.appendChild(actionButtonsElement);
    }

    // After reordering, update the disabled states of move buttons for sections
    updateSectionMoveButtonStates();
}


/**
 * @function clearAllData
 * @description Resets the resumeData object to its initial empty state,
 * clears all form fields, and updates the preview.
 */
function clearAllData() {
    // Reset the main resumeData object
    resumeData = {
        personal: {
            name: '',
            email: '',
            phone: '',
            linkedin: '',
            github: '',
            portfolio: '',
            profileImage: ''
        },
        summary: '',
        experience: [],
        education: [],
        skills: '',
        project: [],
        currentTemplate: 'default', // Reset template to default
        sectionOrder: ['personal', 'summary', 'experience', 'education', 'skills', 'project'] // Reset section order
    };

    // Clear local storage
    localStorage.removeItem('resumeGeneratorData');
    console.log('Resume data cleared from local storage.');

    // Populate form from the reset resumeData (this handles clearing UI and adding initial empty dynamic sections)
    populateFormFromData();

    // Reset template selection buttons and section move buttons
    switchTemplate('default'); // This will also trigger render and save
    updateSectionMoveButtonStates(); // Update after resetting order
}

/**
 * @function switchTemplate
 * @description Changes the active resume template and updates the UI.
 * @param {string} templateName The name of the template to switch to ('default', 'modern', 'minimalist').
 */
function switchTemplate(templateName) {
    resumeData.currentTemplate = templateName;
    updateTemplateSelectionButtons(); // Update button styling
    renderResumePreview(); // Re-render preview with new template styles
    saveDataToLocalStorage(); // Save template preference
}

/**
 * @function updateTemplateSelectionButtons
 * @description Updates the visual state of the template selection buttons
 * to reflect the currently active template.
 */
function updateTemplateSelectionButtons() {
    document.querySelectorAll('.template-select-btn').forEach(button => {
        if (button.dataset.template === resumeData.currentTemplate) {
            button.classList.remove('bg-gray-200', 'text-gray-800', 'hover:bg-gray-300', 'focus:ring-gray-400');
            button.classList.add('bg-blue-500', 'text-white', 'hover:bg-blue-600', 'focus:ring-blue-500');
        } else {
            button.classList.remove('bg-blue-500', 'text-white', 'hover:bg-blue-600', 'focus:ring-blue-500');
            button.classList.add('bg-gray-200', 'text-gray-800', 'hover:bg-gray-300', 'focus:ring-gray-400');
        }
    });
}


// Ensure the DOM is fully loaded before attaching event listeners and loading data
document.addEventListener('DOMContentLoaded', () => {
    loadDataFromLocalStorage(); // Attempt to load data first
    attachEventListeners();    // Attach listeners after data potentially loaded
    updateTemplateSelectionButtons(); // Set initial button state based on loaded template
    updateSectionMoveButtonStates(); // Set initial button states for section reordering
});
