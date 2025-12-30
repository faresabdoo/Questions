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
