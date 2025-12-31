// Admin UI for managing questions via window.leaderboard (Supabase)
(function(){
    const statusEl = document.getElementById('status');
    const listEl = document.getElementById('questions-list');
    const form = document.getElementById('question-form');
    const idInput = document.getElementById('q-id');
    const textInput = document.getElementById('q-text');
    const optionsInput = document.getElementById('q-options');
    const correctInput = document.getElementById('q-correct');
    const hintInput = document.getElementById('q-hint');
    const saveBtn = document.getElementById('save-btn');
    const clearBtn = document.getElementById('clear-btn');
    const formMsg = document.getElementById('form-msg');
    // Bulk import elements (added in admin.html)
    const bulkInput = document.getElementById('bulk-input');
    const previewBulkBtn = document.getElementById('preview-bulk-btn');
    const importBulkBtn = document.getElementById('import-bulk-btn');
    const clearBulkBtn = document.getElementById('clear-bulk-btn');
    const bulkStatus = document.getElementById('bulk-status');
    const bulkPreview = document.getElementById('bulk-preview');

    function escapeHtml(str){
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(s){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[s]; });
    }

    function setStatus(msg, isError){
        statusEl.innerText = msg || '';
        statusEl.className = isError ? 'mb-4 text-sm text-red-400' : 'mb-4 text-sm text-yellow-300';
    }

    function resetForm(){
        idInput.value = '';
        textInput.value = '';
        optionsInput.value = '';
        correctInput.value = '';
        hintInput.value = '';
        formMsg.innerText = '';
    }

    function setBulkStatus(msg, isError){
        if (!bulkStatus) return;
        bulkStatus.innerText = msg || '';
        bulkStatus.className = isError ? 'text-sm text-red-400 mt-2' : 'text-sm text-yellow-200 mt-2';
    }

    function clearBulkPreview(){ if (bulkPreview) bulkPreview.innerHTML = ''; }

    function parseBulkInput(raw) {
        raw = (raw || '').trim();
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
            return [parsed];
        } catch (e) {
            const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
            const out = [];
            for (const line of lines){
                try { out.push(JSON.parse(line)); } catch(err){ out.push({__parseError: err.message, __raw: line}); }
            }
            return out;
        }
    }

    function normalizeBulkItem(item){
        if (!item || typeof item !== 'object') return {ok:false, error:'العنصر ليس كائناً صالحاً'};
        if (item.__parseError) return {ok:false, error:'خطأ في JSON: ' + item.__parseError, raw: item.__raw};
        const question = (item.question || '').toString().trim();
        const options = Array.isArray(item.options) ? item.options.map(o=>o.toString()) : ([]);
        let correct = item.correct;
        const hint = item.hint || '';
        if (!question) return {ok:false, error:'نص السؤال مفقود'};
        if (!options || options.length < 2) return {ok:false, error:'الخيارات غير كافية (حاجة على الأقل خيارين)'};
        if (correct === undefined || correct === null) return {ok:false, error:'حقل correct مفقود'};
        correct = Number(correct);
        if (isNaN(correct)) return {ok:false, error:'حقل correct ليس رقماً'};
        if (correct >= 1 && correct <= options.length) correct = correct - 1;
        if (correct < 0 || correct >= options.length) return {ok:false, error:'قيمة correct خارج النطاق'};
        return {ok:true, value:{question, options, correct, hint}};
    }

    function renderBulkPreview(items){
        if (!bulkPreview) return;
        clearBulkPreview();
        if (!items || items.length === 0){ bulkPreview.innerHTML = '<div class="text-gray-400">لا توجد بيانات للمعاينة.</div>'; return; }
        items.forEach((it, idx) => {
            const wrap = document.createElement('div');
            wrap.className = 'p-2 border rounded bg-gray-900/20';
            const norm = normalizeBulkItem(it);
            if (!norm.ok) {
                wrap.innerHTML = `<div class="text-red-400 font-semibold">#${idx+1} خطأ: ${escapeHtml(norm.error)}</div><div class="text-xs text-gray-300">${escapeHtml(it.__raw || JSON.stringify(it))}</div>`;
            } else {
                const v = norm.value;
                wrap.innerHTML = `<div class="font-semibold">#${idx+1} ${escapeHtml(v.question)}</div><div class="text-xs text-gray-300">${v.options.map((o,i)=> (i===v.correct?'<strong>':'') + escapeHtml(o) + (i===v.correct?'</strong>':'')).join(' • ')}</div>`;
            }
            bulkPreview.appendChild(wrap);
        });
    }

    async function importBulkItems(items){
        if (!window.leaderboard || typeof window.leaderboard.createQuestion !== 'function'){
            setBulkStatus('واجهة لوحة القيادة غير جاهزة - لا يمكن الاستيراد.', true);
            return;
        }
        setBulkStatus('جارٍ استيراد الأسئلة...');
        if (importBulkBtn) importBulkBtn.disabled = true;
        if (previewBulkBtn) previewBulkBtn.disabled = true;
        if (clearBulkBtn) clearBulkBtn.disabled = true;
        let success = 0, failed = 0;
        const errors = [];
        for (let i=0;i<items.length;i++){
            const raw = items[i];
            const norm = normalizeBulkItem(raw);
            if (!norm.ok){ failed++; errors.push({index:i, error:norm.error}); continue; }
            try{
                await window.leaderboard.createQuestion(norm.value);
                success++;
            }catch(err){ failed++; errors.push({index:i, error: (err&&err.message)||err}); }
        }
        setBulkStatus(`اكتمل الاستيراد. ناجح: ${success}، فشل: ${failed}` + (errors.length?(' — تحقق السجل في الكونسول'):''));
        console.log('Bulk import errors:', errors);
        if (importBulkBtn) importBulkBtn.disabled = false;
        if (previewBulkBtn) previewBulkBtn.disabled = false;
        if (clearBulkBtn) clearBulkBtn.disabled = false;
        loadQuestions();
    }

    function renderQuestions(rows){
        listEl.innerHTML = '';
        if (!rows || rows.length === 0) {
            listEl.innerHTML = '<div class="text-gray-400">لا توجد أسئلة بعد.</div>';
            return;
        }
        rows.forEach(r => {
            const item = document.createElement('div');
            item.className = 'p-3 border rounded bg-gray-900/30 flex justify-between items-start gap-3';
            const left = document.createElement('div');
            left.innerHTML = `<div class="font-semibold">${r.question}</div><div class="text-xs text-gray-300">${(r.options||[]).map((o,i)=> `${i+1}. ${o}`).join(' — ')}</div><div class="text-xs text-gray-500">الإجابة الصحيحة: ${ (r.correct !== undefined) ? (r.correct+1) : '-' }</div>`;
            const right = document.createElement('div');
            right.className = 'flex flex-col gap-2';
            const editBtn = document.createElement('button');
            editBtn.className = 'bg-blue-600 px-3 py-1 rounded text-sm';
            editBtn.innerText = 'تعديل';
            editBtn.onclick = () => fillFormForEdit(r);
            const delBtn = document.createElement('button');
            delBtn.className = 'bg-red-600 px-3 py-1 rounded text-sm';
            delBtn.innerText = 'حذف';
            delBtn.onclick = () => removeQuestion(r.id);
            right.appendChild(editBtn);
            right.appendChild(delBtn);
            item.appendChild(left);
            item.appendChild(right);
            listEl.appendChild(item);
        });
    }

    function fillFormForEdit(r){
        idInput.value = r.id || '';
        textInput.value = r.question || '';
        optionsInput.value = (r.options || []).join('\n');
        correctInput.value = (r.correct !== undefined) ? (r.correct+1) : '';
        hintInput.value = r.hint || '';
        window.scrollTo({top:0,behavior:'smooth'});
    }

    function loadQuestions(){
        setStatus('جارٍ جلب الأسئلة...');
        if (!window.leaderboard || typeof window.leaderboard.fetchQuestions !== 'function'){
            setStatus('لوحة القيادة غير مُهيأة أو أن Supabase غير مفعل (لا يمكن جلب الأسئلة).', true);
            return;
        }
        window.leaderboard.fetchQuestions().then(rows => {
            renderQuestions(rows);
            setStatus('');
        }).catch(err => {
            console.error(err);
            setStatus('خطأ عند جلب الأسئلة: ' + (err.message || err), true);
        });
    }

    function removeQuestion(id){
        if (!confirm('هل تريد حذف هذا السؤال نهائياً؟')) return;
        setStatus('جارٍ حذف السؤال...');
        window.leaderboard.deleteQuestion(id).then(()=>{
            setStatus('تم الحذف.');
            loadQuestions();
        }).catch(err=>{
            console.error(err);
            setStatus('خطأ عند الحذف: ' + (err.message||err), true);
        });
    }

    form.addEventListener('submit', function(e){
        e.preventDefault();
        const qText = textInput.value.trim();
        const opts = optionsInput.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
        const correctIdx = parseInt(correctInput.value,10) - 1;
        const hint = hintInput.value.trim();
        if (!qText || opts.length < 2 || isNaN(correctIdx) || correctIdx < 0 || correctIdx >= opts.length){
            formMsg.innerText = 'الرجاء إدخال نص السؤال، خيارين على الأقل، ورقم إجابة صحيحة صحيح.';
            return;
        }
        const payload = { question: qText, options: opts, correct: correctIdx, hint };
        const existingId = idInput.value;
        formMsg.innerText = 'جارٍ الحفظ...';
        if (existingId) {
            window.leaderboard.updateQuestion(existingId, payload).then(()=>{
                formMsg.innerText = 'تم التحديث.';
                resetForm();
                loadQuestions();
            }).catch(err=>{
                console.error(err);
                formMsg.innerText = 'فشل التحديث: ' + (err.message||err);
            });
        } else {
            window.leaderboard.createQuestion(payload).then(()=>{
                formMsg.innerText = 'تم الإضافة.';
                resetForm();
                loadQuestions();
            }).catch(err=>{
                console.error(err);
                formMsg.innerText = 'فشل الإضافة: ' + (err.message||err);
            });
        }
    });

    clearBtn.addEventListener('click', function(){ resetForm(); });

    if (previewBulkBtn) previewBulkBtn.addEventListener('click', function(){
        const raw = bulkInput ? bulkInput.value : '';
        const items = parseBulkInput(raw);
        renderBulkPreview(items);
        setBulkStatus('تم إنشاء معاينة. تحقق من الأخطاء قبل الاستيراد.');
    });

    if (importBulkBtn) importBulkBtn.addEventListener('click', function(){
        const raw = bulkInput ? bulkInput.value : '';
        const items = parseBulkInput(raw);
        if (!items || items.length === 0){ setBulkStatus('لا توجد عناصر للاستيراد.', true); return; }
        if (!confirm(`هل تريد استيراد ${items.length} سؤال/أسئلة؟`)) return;
        importBulkItems(items);
    });

    if (clearBulkBtn) clearBulkBtn.addEventListener('click', function(){ if (bulkInput) bulkInput.value = ''; clearBulkPreview(); setBulkStatus(''); });

    // init
    if (window.leaderboard && window.leaderboard.ready && typeof window.leaderboard.ready.then === 'function'){
        window.leaderboard.ready.then(()=>{
            setStatus('متصل بـ Supabase.');
            loadQuestions();
        }).catch(err=>{
            setStatus('فشل تهيئة لوحة القيادة: ' + (err&&err.message||err), true);
        });
    } else {
        setStatus('لوحة القيادة لم تُحمّل بعد. أعد تحميل الصفحة بعد تهيئة SUPABASE config.');
    }
})();
