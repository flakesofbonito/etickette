export function initCalendar() {
    var calState = {
        year: 0,
        month: 0,
        selected: null,
        open: false,
    };

    function todayPH() {
        var s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
        var p = s.split("-");
        return new Date(+p[0], +p[1] - 1, +p[2]);
    }

    function pad2(n) { return String(n).padStart(2, "0"); }

    function toDateStr(y, m, d) {
        return y + "-" + pad2(m + 1) + "-" + pad2(d);
    }

    function toDisplayStr(dateStr) {
        if (!dateStr) return "";
        var parts = dateStr.split("-");
        var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        return d.toLocaleDateString("en-PH", {
            weekday: "short", year: "numeric", month: "long", day: "numeric",
        });
    }

    function initCal() {
        var t = todayPH();
        calState.year = t.getFullYear();
        calState.month = t.getMonth();
        calState.selected = null;
        calState.open = false;
    }

    function renderCal() {
        var months = ["January","February","March","April","May","June",
            "July","August","September","October","November","December"];
        var lbl = document.getElementById("calMonthYear");
        if (lbl) lbl.textContent = months[calState.month] + " " + calState.year;

        var grid = document.getElementById("calGrid");
        if (!grid) return;
        grid.innerHTML = "";

        var today = todayPH();
        var firstDay = new Date(calState.year, calState.month, 1).getDay();
        var daysInMonth = new Date(calState.year, calState.month + 1, 0).getDate();

        for (var i = 0; i < firstDay; i++) {
            var blank = document.createElement("div");
            blank.className = "cal-day cal-day-blank";
            grid.appendChild(blank);
        }

        for (var d = 1; d <= daysInMonth; d++) {
            var cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cal-day";
            cell.textContent = d;

            var thisDate = new Date(calState.year, calState.month, d);
            var dateStr = toDateStr(calState.year, calState.month, d);
            var isWeekend = thisDate.getDay() === 0;
            var phHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })).getHours();
            var isTodayPastCutoff = thisDate.toDateString() === today.toDateString() && phHour >= 20;

            if (thisDate < today || isWeekend || isTodayPastCutoff) {
                cell.classList.add("cal-day-disabled");
                if (isWeekend) cell.classList.add("cal-day-weekend");
                cell.disabled = true;
            } else {
                if (thisDate.toDateString() === today.toDateString()) cell.classList.add("cal-day-today");
                if (dateStr === calState.selected) cell.classList.add("cal-day-selected");
                (function(ds) { cell.onclick = function() { calSelect(ds); }; })(dateStr);
            }
            grid.appendChild(cell);
        }
    }

    function calSelect(dateStr) {
        calState.selected = dateStr;
        var inp = document.getElementById("reserveDate");
        if (inp) inp.value = dateStr;
        var disp = document.getElementById("calDisplay");
        if (disp) { disp.textContent = toDisplayStr(dateStr); disp.classList.add("cal-trigger-text--filled"); }
        var err = document.getElementById("dateError");
        if (err) err.textContent = "";
        calClose();
        renderCal();
    }

    window.calToggle = function() { calState.open ? calClose() : calOpen(); };

    function calOpen() {
        calState.open = true;
        var panel = document.getElementById("calPanel");
        if (panel) { panel.style.display = "block"; renderCal(); }
        var trigger = document.getElementById("calTrigger");
        if (trigger) trigger.classList.add("cal-trigger--open");
        var arrow = trigger && trigger.querySelector(".cal-trigger-arrow");
        if (arrow) arrow.style.transform = "rotate(180deg)";
        setTimeout(function() { document.addEventListener("click", calOutsideClick); }, 10);
    }

    function calClose() {
        calState.open = false;
        var panel = document.getElementById("calPanel");
        if (panel) panel.style.display = "none";
        var trigger = document.getElementById("calTrigger");
        if (trigger) trigger.classList.remove("cal-trigger--open");
        var arrow = trigger && trigger.querySelector(".cal-trigger-arrow");
        if (arrow) arrow.style.transform = "";
        document.removeEventListener("click", calOutsideClick);
    }

    function calOutsideClick(e) {
        var panel = document.getElementById("calPanel");
        var trigger = document.getElementById("calTrigger");
        if (panel && !panel.contains(e.target) && trigger && !trigger.contains(e.target)) calClose();
    }

    window.calPrev = function() {
        calState.month--;
        if (calState.month < 0) { calState.month = 11; calState.year--; }
        renderCal();
    };

    window.calNext = function() {
        calState.month++;
        if (calState.month > 11) { calState.month = 0; calState.year++; }
        renderCal();
    };

    initCal();

    var attempts = 0;
    var timer = setInterval(function() {
        if (window.openReserveModal && !window._calHooked) {
            window._calHooked = true;
            var orig = window.openReserveModal;
            window.openReserveModal = function(dept) {
                initCal();
                var disp = document.getElementById("calDisplay");
                if (disp) { disp.textContent = "Select a date"; disp.classList.remove("cal-trigger-text--filled"); }
                var inp = document.getElementById("reserveDate");
                if (inp) inp.value = "";
                calClose();
                orig(dept);
            };
        }
        if (window._calHooked || ++attempts > 20) clearInterval(timer);
    }, 100);
}