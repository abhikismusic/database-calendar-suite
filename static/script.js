// FILE: script.js (v4.0 - Phoenix Release)

document.addEventListener('DOMContentLoaded', () => {
    // --- State & Assets ---
    const calendarStateCache = {};
    let activeView = 'month';
    let activeCalendarType = 'text_prompt';
    let currentDate = new Date();
    let currentModalData = [];
    let pendingFiles = [];
    let successSound; // Will be initialized after first user interaction

    // --- DOM Element Selectors ---
    const elements = {
        viewSwitcher: document.querySelector('.view-switcher'),
        tabContainer: document.querySelector('.calendar-tabs'),
        calendarTitle: document.getElementById('calendar-title'),
        calendarGrid: document.getElementById('calendar-grid'),
        monthYearDisplay: document.getElementById('month-year'),
        prevMonthBtn: document.getElementById('prev-month-btn'),
        nextMonthBtn: document.getElementById('next-month-btn'),
        refreshBtn: document.getElementById('refresh-btn'),
        loader: document.getElementById('loader'),
        uploadBtn: document.getElementById('upload-btn'),
        gdriveBtn: document.getElementById('gdrive-btn'),
        deleteMonthBtn: document.getElementById('delete-month-btn'),
        deleteYearBtn: document.getElementById('delete-year-btn'),
        uploadInput: document.getElementById('csv-upload-input'),
        modal: document.getElementById('prompt-modal'),
        modalDate: document.getElementById('modal-date'),
        modalBody: document.getElementById('modal-body'),
        modalCloseBtn: document.querySelector('#prompt-modal .modal-close-btn'),
        downloadCsvBtn: document.getElementById('download-csv-btn'),
        dateRangeModal: document.getElementById('date-range-modal'),
        dateRangeForm: document.getElementById('date-range-form'),
        dateRangeCloseBtn: document.querySelector('#date-range-modal .modal-close-btn'),
        startDateInput: document.getElementById('start-date'),
        endDateInput: document.getElementById('end-date'),
        settingsBtn: document.getElementById('settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        settingsCloseBtn: document.querySelector('#settings-modal .modal-close-btn'),
        accessLogBtn: document.getElementById('access-log-btn'),
        deleteAllBtn: document.getElementById('delete-all-btn'),
        logoutBtn: document.getElementById('logout-btn'),
    };
    
    // --- Core Functions ---
    const showLoader = (show) => {
        if (show) {
            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            elements.loader.innerHTML = '';
            elements.loader.appendChild(spinner);
            elements.loader.classList.remove('hidden');
        } else {
            elements.loader.classList.add('hidden');
        }
    };

    const renderMonthView = (state) => {
        const { datesWithData, distributedDates } = state;
        elements.calendarGrid.innerHTML = '';
        elements.calendarGrid.className = 'grid-view';
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        elements.monthYearDisplay.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;
        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDayOfWeek = firstDayOfMonth.getDay();
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
            const weekdayEl = document.createElement('div'); weekdayEl.className = 'weekday'; weekdayEl.textContent = day; elements.calendarGrid.appendChild(weekdayEl);
        });
        for (let i = 0; i < startDayOfWeek; i++) elements.calendarGrid.appendChild(document.createElement('div')).className = 'day empty';
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayCell = document.createElement('div'); dayCell.className = 'day'; dayCell.dataset.date = dateStr;
            dayCell.innerHTML = `<div class="day-number">${day}</div>`;
            if (datesWithData.has(dateStr)) {
                dayCell.classList.add('has-data');
                if (distributedDates.has(dateStr)) dayCell.classList.add('distributed-data');
                dayCell.innerHTML += `<span class="day-delete-icon" title="Delete data for ${dateStr}">×</span>`;
            } else {
                dayCell.classList.add('no-data');
            }
            elements.calendarGrid.appendChild(dayCell);
        }
    };

    const renderYearView = (state) => {
        const { datesWithData, distributedDates } = state;
        elements.calendarGrid.innerHTML = '';
        elements.calendarGrid.className = 'year-grid-view';
        const year = currentDate.getFullYear();
        elements.monthYearDisplay.textContent = year;
        for (let month = 0; month < 12; month++) {
            const monthContainer = document.createElement('div'); monthContainer.className = 'month-container'; monthContainer.dataset.month = month; monthContainer.dataset.year = year;
            const monthTitle = document.createElement('div'); monthTitle.className = 'month-title'; monthTitle.textContent = new Date(year, month).toLocaleString('default', { month: 'long' });
            const miniCalendar = document.createElement('div'); miniCalendar.className = 'mini-calendar';
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            for (let i = 0; i < firstDay; i++) miniCalendar.appendChild(document.createElement('div'));
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const miniDay = document.createElement('div'); miniDay.className = 'mini-day';
                if (datesWithData.has(dateStr)) {
                    miniDay.classList.add('has-data');
                    if (distributedDates.has(dateStr)) miniDay.classList.add('distributed-data');
                }
                miniCalendar.appendChild(miniDay);
            }
            monthContainer.appendChild(monthTitle);
            monthContainer.appendChild(miniCalendar);
            elements.calendarGrid.appendChild(monthContainer);
        }
    };
    
    const render = () => {
        const state = calendarStateCache[activeCalendarType];
        if (!state) return;
        elements.deleteMonthBtn.style.display = (activeView === 'month') ? 'inline-block' : 'none';
        elements.deleteYearBtn.style.display = (activeView === 'year') ? 'inline-block' : 'none';
        switch (activeView) {
            case 'month': renderMonthView(state); break;
            case 'year': renderYearView(state); break;
        }
    };

    const fetchCalendarData = async (type, force = false) => {
        if (!force && calendarStateCache[type] && calendarStateCache[type].datesWithData.size > 0) {
            render();
        } else {
             showLoader(true);
        }
        try {
            const response = await fetch(`/api/get-calendar-data?type=${type}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            calendarStateCache[type] = {
                datesWithData: new Set(data.datesWithData),
                distributedDates: new Set(data.distributedDates)
            };
            if (type === activeCalendarType) render();
        } catch (error) { console.error('Error fetching calendar data:', error); } finally { showLoader(false); }
    };
    
    const displayPromptsInModal = (dateStr, prompts) => {
        elements.modalDate.textContent = `Prompts for ${dateStr}`;
        elements.modalBody.innerHTML = '';
        if (prompts.length === 0) {
            elements.modalBody.innerHTML = '<p>No prompts found in the file.</p>';
            return;
        }
        prompts.forEach(promptRow => {
            const card = document.createElement('div'); card.className = 'prompt-card';
            const promptText = document.createElement('div'); promptText.className = 'prompt-text'; promptText.textContent = promptRow.prompt || '';
            const meta = document.createElement('div'); meta.className = 'prompt-meta';
            let metaString = '';
            for (const key in promptRow) if (key !== 'prompt' && key !== 'was_downloaded') metaString += `<strong>${key}:</strong> ${promptRow[key] || 'N/A'}    `;
            meta.innerHTML = metaString;
            const copyIcon = document.createElement('span'); copyIcon.className = 'copy-icon'; copyIcon.innerHTML = ''; copyIcon.title = 'Copy prompt to clipboard'; copyIcon.dataset.prompt = promptRow.prompt || '';
            card.appendChild(copyIcon); card.appendChild(promptText); card.appendChild(meta);
            if ('was_downloaded' in promptRow && promptRow.was_downloaded !== null) {
                const statusIcon = document.createElement('span'); statusIcon.className = 'download-status';
                if (promptRow.was_downloaded) { statusIcon.classList.add('downloaded'); statusIcon.innerHTML = '✔'; statusIcon.title = 'Downloaded'; }
                else { statusIcon.classList.add('not-downloaded'); statusIcon.innerHTML = '⇩'; statusIcon.title = 'Not Downloaded'; }
                card.appendChild(statusIcon);
            }
            elements.modalBody.appendChild(card);
        });
        elements.modal.classList.remove('hidden');
    };

    const fetchPromptsForDate = async (dateStr) => {
        showLoader(true);
        try {
            const response = await fetch(`/api/get-prompts/${dateStr}?type=${activeCalendarType}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unknown error');
            currentModalData = data;
            displayPromptsInModal(dateStr, data);
        } catch (error) { console.error('Error fetching prompts:', error); alert(`Could not fetch prompts: ${error.message}`); } finally { showLoader(false); }
    };

    const handleDelete = async (dates, type) => {
        if (!confirm(`Are you sure you want to delete all data for the selected ${type}? This action cannot be undone.`)) return;
        showLoader(true);
        try {
            const response = await fetch('/api/delete-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates, type: activeCalendarType }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            delete calendarStateCache[activeCalendarType];
            fetchCalendarData(activeCalendarType, true);
            alert(`${result.deleted_count || 0} file(s) deleted.`);
        } catch (error) { alert(`Deletion failed: ${error.message}`); } finally { showLoader(false); }
    };

    const uploadFilesWithData = async (files, formData) => {
        for (const file of files) formData.append('file', file);
        formData.append('type', activeCalendarType);
        showLoader(true);
        try {
            const response = await fetch('/api/upload-csv', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            if(successSound) successSound.play().catch(e => console.error("Error playing sound:", e));
            delete calendarStateCache[activeCalendarType];
            fetchCalendarData(activeCalendarType, true);
            alert(`Successfully processed data for ${result.processed_dates.length} day(s).`);
        } catch (error) { alert(`Upload failed: ${error.message}`); } finally { showLoader(false); }
    };

    const downloadCSV = () => {
        if (currentModalData.length === 0) return alert("No data to download.");
        const headers = Object.keys(currentModalData[0]);
        let csvContent = headers.join(',') + '\r\n';
        currentModalData.forEach(row => {
            const values = headers.map(header => {
                let value = row[header] === null ? '' : row[header];
                if (typeof value === 'string' && value.includes(',')) value = `"${value}"`;
                return value;
            });
            csvContent += values.join(',') + '\r\n';
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", `${elements.modalDate.textContent.replace('Prompts for ', '')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const navigate = (direction) => {
        switch (activeView) {
            case 'month': currentDate.setMonth(currentDate.getMonth() + direction); break;
            case 'year': currentDate.setFullYear(currentDate.getFullYear() + direction); break;
        }
        render();
    };

    const switchCalendar = (newType) => {
        activeCalendarType = newType;
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === newType));
        const activeBtn = document.querySelector(`.tab-btn.active`);
        elements.calendarTitle.textContent = activeBtn ? activeBtn.textContent.toUpperCase() + ' CALENDAR' : 'DATABASE CALENDAR';
        fetchCalendarData(newType, false);
    };

    // --- Event Handlers ---
    elements.prevMonthBtn.addEventListener('click', () => navigate(-1));
    elements.nextMonthBtn.addEventListener('click', () => navigate(1));
    elements.refreshBtn.addEventListener('click', () => fetchCalendarData(activeCalendarType, true));
    elements.uploadBtn.addEventListener('click', () => elements.uploadInput.click());
    elements.tabContainer.addEventListener('click', (e) => { if (e.target.matches('.tab-btn')) switchCalendar(e.target.dataset.type); });

    elements.viewSwitcher.addEventListener('click', (e) => {
        if (e.target.matches('.view-btn') && !e.target.classList.contains('active')) {
            activeView = e.target.dataset.view;
            document.querySelectorAll('.view-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === activeView));
            currentDate = new Date();
            render();
        }
    });

    elements.gdriveBtn.addEventListener('click', async () => {
        showLoader(true);
        try {
            const response = await fetch(`/api/get-drive-folder-info?type=${activeCalendarType}`);
            const data = await response.json();
            if (response.ok && data.folder_link) window.open(data.folder_link, '_blank');
            else throw new Error(data.error || 'Could not get folder link.');
        } catch (error) { alert(`Error opening folder: ${error.message}`); } finally { showLoader(false); }
    });

    elements.uploadInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        pendingFiles = Array.from(files);
        if (activeCalendarType === 'text_prompt') {
            const today = new Date().toISOString().split('T')[0];
            elements.startDateInput.value = today;
            elements.endDateInput.value = today;
            elements.dateRangeModal.classList.remove('hidden');
        } else {
            const formData = new FormData();
            uploadFilesWithData(pendingFiles, formData);
        }
        e.target.value = '';
    });
    
    elements.dateRangeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (pendingFiles.length > 0) {
            const formData = new FormData();
            formData.append('startDate', elements.startDateInput.value);
            formData.append('endDate', elements.endDateInput.value);
            uploadFilesWithData(pendingFiles, formData);
            pendingFiles = [];
            elements.dateRangeModal.classList.add('hidden');
        }
    });

    elements.dateRangeCloseBtn.addEventListener('click', () => {
        pendingFiles = [];
        elements.dateRangeModal.classList.add('hidden');
    });

    elements.deleteMonthBtn.addEventListener('click', () => {
        if (activeView !== 'month') return;
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const dates = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
        handleDelete(dates, 'month');
    });

    elements.deleteYearBtn.addEventListener('click', () => {
        if (activeView !== 'year') return;
        const year = currentDate.getFullYear();
        let dates = [];
        for (let month = 0; month < 12; month++) for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) dates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        handleDelete(dates, 'year');
    });

    elements.calendarGrid.addEventListener('click', (e) => {
        const monthContainer = e.target.closest('.month-container');
        if (monthContainer) {
            currentDate = new Date(monthContainer.dataset.year, monthContainer.dataset.month, 1);
            activeView = 'month';
            document.querySelectorAll('.view-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === 'month'));
            render();
            return;
        }
        const dayCell = e.target.closest('.day');
        if (e.target.matches('.day-delete-icon')) {
            e.stopPropagation();
            if (dayCell) handleDelete([dayCell.dataset.date], 'day');
        } else if (dayCell && dayCell.classList.contains('has-data')) {
            fetchPromptsForDate(dayCell.dataset.date);
        }
    });
    
    elements.modalBody.addEventListener('click', (e) => {
        if (e.target.matches('.copy-icon')) {
            const promptToCopy = e.target.dataset.prompt;
            navigator.clipboard.writeText(promptToCopy).then(() => {
                e.target.textContent = '✅';
                setTimeout(() => { e.target.innerHTML = ''; }, 1000);
            }).catch(err => { console.error('Failed to copy text: ', err); alert('Failed to copy text.'); });
        }
    });

    elements.modalCloseBtn.addEventListener('click', () => elements.modal.classList.add('hidden'));
    elements.dateRangeModal.addEventListener('click', (e) => { if(e.target === elements.dateRangeModal) elements.dateRangeModal.classList.add('hidden'); });
    elements.modal.addEventListener('click', (e) => { if (e.target === elements.modal) elements.modal.classList.add('hidden'); });
    elements.downloadCsvBtn.addEventListener('click', downloadCSV);

    elements.settingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
    elements.settingsCloseBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
    elements.settingsModal.addEventListener('click', (e) => { if(e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden'); });

    elements.accessLogBtn.addEventListener('click', async () => {
        showLoader(true);
        try {
            const response = await fetch('/api/get-log-file-url');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not retrieve log URL.');
            window.open(data.url, '_blank');
        } catch (error) { alert(`Error: ${error.message}`); } finally { showLoader(false); }
    });

    elements.logoutBtn.addEventListener('click', async () => {
        if (confirm("Are you sure you want to log out? You will need to re-authorize the app on the next run.")) {
            await fetch('/api/logout', { method: 'POST' });
            alert("You have been logged out. Please close this browser tab and restart the Python application.");
            document.body.innerHTML = "<h1>Logged Out. Please restart the application.</h1>";
        }
    });

    elements.deleteAllBtn.addEventListener('click', () => {
        const confirmation = prompt("DANGER! This will delete the entire app root folder and all its contents from your Google Drive. This cannot be undone. To confirm, type 'DELETE' in the box below.");
        if (confirmation === "DELETE") {
            showLoader(true);
            fetch('/api/delete-all-data', { method: 'POST' })
                .then(response => response.json().then(data => {
                    if (!response.ok) throw new Error(data.error || 'Deletion failed.');
                    alert("All application data has been deleted successfully.");
                    Object.keys(calendarStateCache).forEach(key => delete calendarStateCache[key]);
                    fetchCalendarData(activeCalendarType, true);
                }))
                .catch(err => alert(err.message))
                .finally(() => {showLoader(false); elements.settingsModal.classList.add('hidden');});
        } else {
            alert("Deletion cancelled.");
        }
    });
    
    // --- Initial Load ---
    const init = () => {
        // Initialize sound after first user interaction
        document.body.addEventListener('click', () => {
            if (!successSound) successSound = new Audio('/static/sounds/success.mp3');
        }, { once: true });

        ['text_prompt', 'edit_prompt', 'video_prompt', 'audio_prompt'].forEach(type => {
            calendarStateCache[type] = { datesWithData: new Set(), distributedDates: new Set() };
        });
        switchCalendar('text_prompt');
    };

    init();
});