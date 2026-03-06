/* ═══════════════════════════════════════════════════════
   app.js — صحتك  |  Supabase Integration Layer (Phase 1)
   ═══════════════════════════════════════════════════════ */

// ─── 1. Supabase Init ────────────────────────────────
// ⚠️  استبدل هذي القيم بقيمك من Supabase Dashboard → Settings → API
const SUPABASE_URL  = 'https://dzkkothjuqrbcgrnpttp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6a2tvdGhqdXFyYmNncm5wdHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NjQyNzAsImV4cCI6MjA4ODE0MDI3MH0.BkRYwdI4C63Sb4t2BDnOApun8KEkQ3FICDo_-1bFo88';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);


// ─── 2. Auth Functions ───────────────────────────────

/** تسجيل حساب جديد بالإيميل */
async function authSignup(email, password) {
    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
            // ما نحتاج تأكيد إيميل للمسابقة
            emailRedirectTo: window.location.origin + '/dashboard.html'
        }
    });
    if (error) throw error;
    return data;
}

/** تسجيل دخول */
async function authLogin(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        // لو الخطأ بسبب عدم تأكيد الإيميل، نوضح الرسالة
        if (error.message && error.message.includes('Email not confirmed')) {
            throw new Error('الإيميل ما تأكد — روح Supabase Dashboard → Authentication → Settings → عطّل "Confirm email"');
        }
        throw error;
    }
    return data;
}

/** تسجيل خروج */
async function authLogout() {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    // ارجع للصفحة الرئيسية
    window.location.href = 'login.html';
}

/** جلب بروفايل المريض */
async function getProfile() {
    const { data: { user }, error: uErr } = await sb.auth.getUser();
    if (uErr || !user) return null;

    const { data, error } = await sb.from('patient_profile')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) { console.error('Profile load error:', error); return null; }
    return data;
}

/** جلب المستخدم الحالي */
async function getCurrentUser() {
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user) return null;
    return user;
}

/** حماية الصفحة */
async function requireAuth() {
    const user = await getCurrentUser();
    return user;
}


// ─── 3. Patient Profile ──────────────────────────────

/** حفظ / تحديث بروفايل المريض (upsert) */
async function saveProfile(profileData) {
    const { data: { user }, error: uErr } = await sb.auth.getUser();
    if (uErr || !user) throw new Error('Not authenticated');

    const { data, error } = await sb.from('patient_profile')
        .upsert({
            ...profileData,
            user_id: user.id,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        .select()
        .single();

    if (error) throw error;
    return data;
}


// ─── 4. Wearable Data (بيانات السوارة) ──────────────

/** إدخال قراءة جديدة من السوارة */
async function insertWearable(readings) {
    const { data: { user }, error: _uErr } = await sb.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await sb.from('wearable_data')
        .insert({
            user_id:       user.id,
            heart_rate:    readings.heartRate    || null,
            blood_sugar:   readings.bloodSugar   || null,
            bp_systolic:   readings.bpSystolic   || null,
            bp_diastolic:  readings.bpDiastolic  || null,
            temperature:   readings.temperature  || null,
            steps:         readings.steps        || null,
            sleep_hours:   readings.sleepHours   || null,
            stress_level:  readings.stressLevel  || null,
            activity_pct:  readings.activityPct  || null,
            recorded_at:   readings.recordedAt   || new Date().toISOString()
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/** جلب آخر قراءة للسوارة */
async function getLatestWearable() {
    const { data: { user }, error: _uErr } = await sb.auth.getUser();
    if (!user) return null;

    const { data, error } = await sb.from('wearable_data')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
}

/** توليد قراءات عشوائية واقعية (للتجربة / Demo) */
function generateSampleReadings() {
    return {
        heartRate:   Math.floor(60 + Math.random() * 40),        // 60–100 BPM
        bloodSugar:  Math.floor(70 + Math.random() * 60),        // 70–130 mg/dL
        bpSystolic:  Math.floor(100 + Math.random() * 40),       // 100–140 mmHg
        bpDiastolic: Math.floor(60 + Math.random() * 30),        // 60–90 mmHg
        temperature: +(36 + Math.random() * 1.5).toFixed(1),     // 36.0–37.5 °C
        steps:       Math.floor(2000 + Math.random() * 8000),    // 2000–10000
        sleepHours:  +(5 + Math.random() * 4).toFixed(1),        // 5.0–9.0 hrs
        stressLevel: Math.floor(10 + Math.random() * 60),        // 10–70
        activityPct: Math.floor(30 + Math.random() * 70),        // 30–100%
        recordedAt:  new Date().toISOString()
    };
}


// ─── 5. Lab Reports (التحاليل الطبية) ────────────────

/** رفع ملف تحليل إلى Storage وحفظ السجل في DB */
async function uploadLabFile(file) {
    const { data: { user }, error: _uErr } = await sb.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // اسم فريد للملف
    const ext = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${ext}`;

    // رفع إلى bucket
    const { data: uploadData, error: uploadError } = await sb.storage
        .from('lab-reports')
        .upload(fileName, file);

    if (uploadError) throw uploadError;

    // جلب URL العام
    const { data: urlData } = sb.storage
        .from('lab-reports')
        .getPublicUrl(fileName);

    const fileUrl = urlData.publicUrl;

    // حفظ السجل في الجدول
    const { data, error } = await sb.from('lab_reports')
        .insert({
            user_id:   user.id,
            file_url:  fileUrl,
            file_name: file.name,
            file_type: file.type || 'application/pdf'
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/** جلب كل تحاليل المستخدم */
async function getLabs() {
    const { data: { user }, error: _uErr } = await sb.auth.getUser();
    if (!user) return [];

    const { data, error } = await sb.from('lab_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/** جلب نتائج تحليل معين (لو فيه تحليل AI عليه) */
async function getLabResults(labReportId) {
    const { data, error } = await sb.from('lab_results')
        .select('*')
        .eq('report_id', labReportId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}


// ─── 6. AI Daily Reports (مرحلة 2 — الحين عرض فقط) ──

/** جلب تقارير AI اليومية */
async function getAIDailyReports(limit = 5) {
    const { data: { user }, error: _uErr } = await sb.auth.getUser();
    if (!user) return [];

    const { data, error } = await sb.from('ai_daily_reports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}


// ─── 7. Utility Helpers ──────────────────────────────

/** حساب العمر من تاريخ الميلاد */
function calcAge(dob) {
    if (!dob) return null;
    const birth = new Date(dob);
    const now   = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age;
}

/** حساب BMI */
function calcBMI(weightKg, heightCm) {
    if (!weightKg || !heightCm) return null;
    const h = heightCm / 100;
    return +(weightKg / (h * h)).toFixed(1);
}

/** حساب BMR (معدل الأيض الأساسي — Mifflin-St Jeor) */
function calcBMR(weightKg, heightCm, age, gender) {
    if (!weightKg || !heightCm || !age) return null;
    if (gender === 'male' || gender === 'ذكر') {
        return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + 5);
    }
    return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age - 161);
}

/** حساب السعرات اليومية المطلوبة حسب مستوى النشاط */
function calcDailyCalories(bmr, activityLevel) {
    const multipliers = {
        'خامل (لا تمارين)':              1.2,
        'نشاط خفيف (1-3 أيام/أسبوع)':   1.375,
        'نشاط معتدل (3-5 أيام/أسبوع)':  1.55,
        'نشاط عالٍ (6-7 أيام/أسبوع)':   1.725,
        'رياضي محترف':                   1.9
    };
    const mult = multipliers[activityLevel] || 1.55;
    return Math.round(bmr * mult);
}

/** عرض توست / إشعار بسيط */
function showToast(message, type = 'info') {
    // لو فيه توست قديم شيله
    const old = document.getElementById('app-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
        padding: 12px 24px; border-radius: 12px; font-family: 'Cairo', sans-serif;
        font-size: 13px; font-weight: 700; z-index: 9999; color: white;
        box-shadow: 0 6px 20px rgba(0,0,0,0.2); animation: toastIn 0.3s ease;
        background: ${type === 'error' ? '#e53e3e' : type === 'success' ? '#38a169' : '#4299e1'};
    `;
    document.body.appendChild(toast);

    // إضافة animation
    if (!document.getElementById('toast-style')) {
        const style = document.createElement('style');
        style.id = 'toast-style';
        style.textContent = `
            @keyframes toastIn { from { opacity:0; transform: translateX(-50%) translateY(20px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => toast.remove(), 3500);
}

/** تحديث ساعة الـ status bar */
function updateClock() {
    const el = document.getElementById('statusTime');
    if (!el) return;
    const now = new Date();
    el.textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}

// تشغيل الساعة تلقائياً
updateClock();
setInterval(updateClock, 30000);
