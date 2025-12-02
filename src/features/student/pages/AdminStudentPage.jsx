// src/features/student/components/StudentEnrollments.jsx
// ============================================================================
// 원생(학생) 관리 화면 — 탭 분리 개정판 (생략 없음, 주석 강화)
// - ✅ '형제' 탭 추가
// - ✅ 'gender' (성별) 필드 신규/수정 폼에 추가
// - ✅ 생년월일 입력 방어 (4자리 연도 강제)
// - ✅ isCodeEnabled 헬퍼 함수 누락 추가
// - ✅ Field/RO 헬퍼 함수 파일 하단으로 이동
// - ✅ 신규 등록 후 다시 열 때 아이디/비밀번호 초기화
// - ✅ 학년 저장: grade → gradeLabel 로 서버에 전송 (핵심 버그 수정)
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';

// 학생 CRUD/메타 유틸
import {
    listStudents, getStudent, createStudent, updateStudent,
    uploadStudentPhoto, deleteStudent, getStudentMeta, lookupAdminUsers,
} from '@/features/student/api/studentApi.js';

// 계정/비밀번호
import { changeStudentPassword, upsertStudentAccount } from '@/features/student/api/studentAccountApi.js';

// 반 배정(목록만 부모에서 로드하여 자식에 주입)
import { listStudentEnrollments } from '@/features/student/api/studentEnrollmentApi.js';

// ✅ 형제 탭 API
import { linkSibling } from '@/features/student/api/studentSiblingApi.js';

// 공통 코드/알림
import { getCodes } from '@/features/system/api/commonCodeAdminApi.js';
import { alertError, alertInfo, alertSuccess, confirmDialog } from '@/common/ui/alert.js';

// 공용 UI/유틸
import Modal from '@/common/components/ui/Modal.jsx';
import Avatar from '@/common/components/ui/Avatar.jsx';
import AddressSearch from '@/common/components/AddressSearch.jsx';
import { uploadsUrl, withBust } from '@/common/utils/mediaUrl.js';
import { useImagePreview } from '@/common/components/ui/ImagePreview.jsx';

// 하위 탭 컴포넌트
import StudentEnrollments from '@/features/student/components/StudentEnrollments.jsx';
import StudentConsults    from '@/features/student/components/StudentConsults.jsx';
import StudentTuitionTab  from '@/features/student/components/StudentTuitionTab.jsx';
import StudentMemoTab     from '@/features/student/components/StudentMemoTab.jsx';
import StudentFamilyTab   from '@/features/student/components/StudentFamilyTab.jsx';
import StudentSiblingTab  from '@/features/student/components/StudentSiblingTab.jsx';
import StudentSearchModal from '@/features/student/components/StudentSearchModal.jsx';

// 스타일
import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-shared.css';
import '@/features/student/styles/admin-student.css';

// ---- 공용 알림 safe 래퍼 ----------------------------------------------------
const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

// ---- 공통코드 키 ------------------------------------------------------------
const CODE_LOC            = 'WORK_LOCATION';
const CODE_STAGE          = 'SCHOOL_STAGE';
const CODE_FAMILY_REL     = 'GUARDIAN_REL';
const CODE_STUDENT_STATUS = 'STUDENT_STATUS';
const CODE_NOTICE_CHANNEL = 'NOTICE_CHANNEL';
const CODE_ENROLL_STATUS  = 'ENROLL_STATUS';

// ---- 작은 유틸 --------------------------------------------------------------
const sorted = (arr=[]) =>
    arr.slice().sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || String(a.name).localeCompare(String(b.name),'ko'));

// 사진 경로 빌더
function buildPhotoSrc(row){
    if (!row) return '';
    if (row.photoUrl)  return row.photoUrl;
    if (row.photoPath) return uploadsUrl(row.photoPath);
    return '';
}

// 학부별 학년 콤보
function gradesForStage(st){
    const s = String(st||'').toUpperCase();
    if (s==='E') return [1,2,3,4,5,6];
    if (s==='M' || s==='H') return [1,2,3];
    return [];
}

// ---- SweetAlert 입력 다이얼로그 --------------------------------------------
const themeColor = '#4f46e5';
const commonHooks = {
    willOpen: () => { document.body.classList.add('modal-open'); },
    didClose: () => { document.body.classList.remove('modal-open'); }
};

async function inputDialog({ title='입력', text='', placeholder='', defaultValue='', validate } = {}){
    const r = await Swal.fire({
        title, text, input: 'text', inputValue: defaultValue,
        inputPlaceholder: placeholder,
        confirmButtonText: '확인', cancelButtonText: '취소',
        showCancelButton: true, confirmButtonColor: themeColor,
        reverseButtons: true, focusCancel: true,
        inputAttributes: { autocapitalize: 'off' },
        inputValidator: (v)=> validate?.(v) || undefined,
        didOpen: () => {
            const el = Swal.getHtmlContainer();
            if (el) el.style.whiteSpace='pre-line';
        },
        ...commonHooks
    });
    return r.isConfirmed ? (r.value ?? '') : null;
}

async function textareaDialog({ title='내용 입력', text='', placeholder='', defaultValue='', validate } = {}){
    const r = await Swal.fire({
        title, text, input: 'textarea', inputValue: defaultValue,
        inputPlaceholder: placeholder, inputLabel: undefined,
        confirmButtonText: '저장', cancelButtonText: '취소',
        showCancelButton: true, confirmButtonColor: themeColor,
        reverseButtons: true, focusCancel: true,
        inputValidator: (v)=> validate?.(v) || undefined,
        didOpen: () => {
            const el = Swal.getHtmlContainer();
            if (el) el.style.whiteSpace='pre-line';
        },
        ...commonHooks
    });
    return r.isConfirmed ? (r.value ?? '') : null;
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================
export default function AdminStudentPage(){
    // ===== 필터 =====
    const [workLoc, setWorkLoc] = useState('');
    const [stage,   setStage]   = useState('');
    const [keyword, setKeyword] = useState('');
    const [kwDebounced, setKwDebounced] = useState('');

    // ===== 공통코드 =====
    const [locCodes, setLocCodes]             = useState([]);
    const [stgCodes, setStgCodes]             = useState([]); // ✅ 학부 코드 목록
    const [familyRelCodes, setFamilyRelCodes] = useState([]);
    const [statusCodes, setStatusCodes]       = useState([]);
    const [noticeChannelCodes, setNoticeChannelCodes] = useState([]);
    const [enrollStatusCodes, setEnrollStatusCodes]   = useState([]);

    // ===== 목록/상세 =====
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    const [detail, setDetail]   = useState(null);
    const [edit,   setEdit]     = useState(null);
    const [editing, setEditing] = useState(false);
    const [saving,  setSaving]  = useState(false);
    const [imgVersion, setImgVersion] = useState(0);

    // 신규 등록 모드
    const [creating, setCreating] = useState(false);
    const [newForm, setNewForm] = useState({
        loginId:'', password:'',
        name:'', schoolStage:'', workLocationCode:'',
        birthdate:'', gender: '', // ✅ 성별
        phone:'', email:'',
        postalCode:'', address:'', detailAddress:'',
        schoolId: null, schoolName: '', grade: '',
        memo:'', status:'PENDING',
        preferSms: true, preferEmail: false, preferPush: false, pushUserKey: ''
    });

    // 탭
    const [tab, setTab] = useState('ENROLL');

    // 하위(반 배정)만 부모에서 관리하여 자식에 주입
    const [enrolls, setEnrolls] = useState([]);

    // 이미지 프리뷰
    const { openPreview, PreviewPortal } = useImagePreview(imgVersion);

    // 비밀번호/빠른 메모 모달
    const [pwOpen, setPwOpen]               = useState(false);
    const [quickMemoOpen, setQuickMemoOpen] = useState(false);

    // 학교 검색 모달
    const [schoolPickOpen, setSchoolPickOpen] = useState(false);
    const [schoolQuery, setSchoolQuery]       = useState('');
    const [schoolResults, setSchoolResults]   = useState([]);
    const [schoolLoading, setSchoolLoading]   = useState(false);

    // 형제 검색 모달
    const [siblingPickOpen, setSiblingPickOpen] = useState(false);

    // 메모 탭 입력 상태(상단 빠른 메모만 사용)
    const [memoText, setMemoText] = useState('');
    const [memoReloadTick, setMemoReloadTick] = useState(0);

    // 상세 접힘 상태
    const [infoCollapsed, setInfoCollapsed] = useState(true);
    useEffect(()=>{
        if (editing) setInfoCollapsed(false);
    },[editing]);

    // ===== 알림 채널 사용 가능 여부 =====
    const noticeEnabledMap = useMemo(()=>{
        const map = { SMS:false, EMAIL:false, APP:false };
        for (const c of noticeChannelCodes || []) {
            const code = String(c.code || '').toUpperCase();
            const on = isCodeEnabled(c);
            if (code === 'SMS')                       map.SMS   = on;
            if (code === 'EMAIL' || code === 'MAIL') map.EMAIL = on;
            if (code === 'APP'   || code === 'PUSH') map.APP   = on;
        }
        return map;
    },[noticeChannelCodes]);
    const smsEnabled   = !!noticeEnabledMap.SMS;
    const emailEnabled = !!noticeEnabledMap.EMAIL;
    const appEnabled   = !!noticeEnabledMap.APP;
    const isActiveStudent = String(detail?.status||'').toUpperCase() === 'ACTIVE';

    // ===== 공통코드 로드 =====
    useEffect(()=>{
        let alive = true;
        (async ()=>{
            try{
                const [loc, stg, rel, sts, notice, enrollStat] = await Promise.all([
                    getCodes(CODE_LOC),
                    getCodes(CODE_STAGE),
                    getCodes(CODE_FAMILY_REL),
                    getCodes(CODE_STUDENT_STATUS),
                    getCodes(CODE_NOTICE_CHANNEL).catch(()=>[]),
                    getCodes(CODE_ENROLL_STATUS).catch(()=>[])
                ]);
                if(!alive) return;
                const sortedBy = (arr=[]) => arr.slice().sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || String(a.name).localeCompare(b.name,'ko'));
                setLocCodes(sortedBy(loc||[]));
                setStgCodes(sortedBy(stg||[]));
                setFamilyRelCodes(sortedBy(rel||[]));
                setStatusCodes(sortedBy(sts||[]));
                setNoticeChannelCodes(sortedBy(notice||[]));
                setEnrollStatusCodes(sortedBy(enrollStat||[]));
            }catch{
                safeError('오류','공통코드 조회 실패');
            }
        })();
        return ()=>{ alive=false; };
    },[]);

    // ===== 검색 디바운스 =====
    useEffect(()=>{
        const t = setTimeout(()=> setKwDebounced(keyword.trim()), 250);
        return ()=> clearTimeout(t);
    },[keyword]);

    // ===== 목록 로드 =====
    const inflight = useRef(0);
    const loadList = useCallback(async (keep=false)=>{
        setLoading(true);
        const my = ++inflight.current;
        try{
            const res = await listStudents({
                workLocationCode: workLoc || undefined,
                schoolStage: stage || undefined,
                keyword: kwDebounced || undefined,
                page:0, size:30
            });
            if (my !== inflight.current) return;
            const rows = Array.isArray(res?.content) ? res.content : (Array.isArray(res)?res:[]);
            rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko',{sensitivity:'base'}));
            setList(rows);
            setSelectedId(prev =>
                (keep && prev && rows.some(r=>r.id===prev))
                    ? prev
                    : (rows[0]?.id ?? null)
            );
        }catch(e){
            setList([]);
            safeError('오류', e?.response?.data?.message || '학생 목록 조회 실패');
        }finally{
            if (my===inflight.current) setLoading(false);
        }
    },[workLoc, stage, kwDebounced]);

    useEffect(()=>{ loadList(false); },[loadList]);

    // ===== 상세 → edit 세팅 (gender, gradeLabel 반영) =====
    const toEdit = (d)=>({
        name: d?.name ?? '',
        schoolStage: d?.schoolStage ?? (stgCodes[0]?.code ?? ''),
        workLocationCode: d?.workLocationCode ?? (locCodes[0]?.code ?? ''),
        birthdate: d?.birthdate ?? '',
        gender: d?.gender ?? '',
        phone: d?.phone ?? '',
        email: d?.email ?? '',
        postalCode: d?.postalCode ?? '',
        address: d?.address ?? '',
        detailAddress: d?.detailAddress ?? '',
        preferSms: d?.preferSms ?? true,
        preferEmail: d?.preferEmail ?? false,
        preferPush: d?.preferPush ?? false,
        pushUserKey: d?.pushUserKey ?? '',
        memo: d?.memo ?? '',
        status: d?.status ?? 'PENDING',
        schoolId: d?.schoolId ?? (d?.school?.id ?? null),
        schoolName: d?.schoolName ?? (d?.school?.name ?? ''),
        // ✅ 서버에서 내려오는 gradeLabel → 편집 값은 grade로 사용
        grade: d?.gradeLabel ?? ''
    });

    // ===== 상세 + 메타 로드 =====
    const loadDetailWithMeta = useCallback(async (id)=>{
        if (!id) return null;
        try{
            const d = await getStudent(id);
            let merged = d;
            try{
                const meta = await getStudentMeta(id);
                const ids = [meta?.createdBy, meta?.updatedBy].filter(Boolean);
                const nameMap = ids.length ? await lookupAdminUsers(ids) : {};
                merged = {
                    ...d,
                    createdAt:  meta?.createdAt ?? d.createdAt ?? d.createdDate ?? null,
                    updatedAt:  meta?.updatedAt ?? d.updatedAt ?? d.updatedDate ?? null,
                    createdBy:  meta?.createdBy ?? d.createdBy ?? null,
                    updatedBy:  meta?.updatedBy ?? d.updatedBy ?? null,
                    createdByName: nameMap[meta?.createdBy] ?? d.createdByName ?? null,
                    updatedByName: nameMap[meta?.updatedBy] ?? d.updatedByName ?? null,
                };
            }catch{/* 메타는 선택 */}
            setDetail(merged);
            setEdit(toEdit(merged));
            setEditing(false);
            return merged;
        }catch{
            setDetail(null);
            setEdit(null);
            setEditing(false);
            return null;
        }
    },[stgCodes, locCodes]);

    // ===== 하위 데이터: 배정 =====
    const loadEnrollsOnly = useCallback(async (id)=>{
        try{
            const en = await listStudentEnrollments(id);
            setEnrolls(Array.isArray(en)?en:(en?.content||[]));
        }catch{
            setEnrolls([]);
        }
    },[]);

    // ===== 상세 로드 트리거 =====
    useEffect(()=>{
        if (creating){
            setDetail(null);
            setEdit(null);
            setEditing(false);
            setEnrolls([]);
            return;
        }
        if (!selectedId){
            setDetail(null);
            setEdit(null);
            setEditing(false);
            setEnrolls([]);
            return;
        }
        let alive = true;
        (async ()=>{
            const merged = await loadDetailWithMeta(selectedId);
            if(!alive || !merged) return;
            await loadEnrollsOnly(selectedId);
        })();
        return ()=>{ alive=false; };
    },[selectedId, imgVersion, creating, loadDetailWithMeta, loadEnrollsOnly]);

    // ===== 새로고침 =====
    const refreshAll = useCallback(async ()=>{
        await loadList(true);
        if (!creating && selectedId){
            const merged = await loadDetailWithMeta(selectedId);
            if (merged) await loadEnrollsOnly(selectedId);
        }
    },[creating, selectedId, loadList, loadEnrollsOnly, loadDetailWithMeta]);

    // ===== 저장(수정) =====
    const onSave = async ()=>{
        if (!selectedId || !edit) return;
        const name = (edit.name||'').trim();
        if (!name) return safeInfo('안내','이름을 입력하세요.');
        setSaving(true);
        try{
            const { memo: _omitMemo, ...rest } = edit || {};
            const payload = { ...rest };

            // 연락처/이메일 없으면 동의 자동 OFF
            if (!smsEnabled)   payload.preferSms = false;
            if (!emailEnabled) payload.preferEmail = false;
            if (!appEnabled) { payload.preferPush = false; payload.pushUserKey = null; }
            if (!String(payload.phone||'').trim())  payload.preferSms = false;
            if (!String(payload.email||'').trim())  payload.preferEmail = false;

            // ✅ 핵심: 학년은 gradeLabel 로 서버에 전달
            await updateStudent(selectedId, {
                ...payload,
                gender: payload.gender || null,
                schoolId: payload.schoolId ?? null,
                gradeLabel: payload.grade ?? null  // <<--- 여기가 포인트
            });

            const merged = await loadDetailWithMeta(selectedId);
            await safeOk('성공','저장되었습니다.');
            if (merged) await loadEnrollsOnly(selectedId);
            await loadList(true);
        }catch(e){
            safeError('오류', e?.response?.data?.message || '저장 실패');
        }finally{
            setSaving(false);
        }
    };

    // ===== 사진 업로드 =====
    const onUploadPhoto = async (e)=>{
        const file = e.target.files?.[0];
        if(!file) return;
        try{
            await uploadStudentPhoto(selectedId, file);
            setImgVersion(v=>v+1);
            await loadList(true);
            await loadDetailWithMeta(selectedId);
            await safeOk('성공','사진이 변경되었습니다.');
        }catch(e){
            safeError('오류', e?.response?.data?.message || '이미지 업로드 실패');
        }finally{
            e.target.value='';
        }
    };

    // ===== 신규 생성 (시작/취소/실행) =====
    const startCreate = ()=>{
        setCreating(true);
        setSelectedId(null);
        setDetail(null);
        setEdit(null);
        setEditing(false);
        setTab('ENROLL');
        setNewForm(f=>({
            ...f,
            // 이전 신규 입력값 초기화
            loginId: '',
            password: '',
            name:'', schoolStage: stage || (stgCodes[0]?.code ?? ''),
            workLocationCode: workLoc || (locCodes[0]?.code ?? ''),
            birthdate:'', gender: '',
            phone:'', email:'',
            schoolId: null, schoolName:'', grade:'',
            memo:'', status:'PENDING',
            postalCode:'', address:'', detailAddress:'',
            preferSms: true, preferEmail: false, preferPush: false, pushUserKey: ''
        }));
    };

    const cancelCreate = ()=>{
        setCreating(false);
        setNewForm({
            loginId:'', password:'',
            name:'', schoolStage:'', workLocationCode:'',
            birthdate:'', gender: '',
            phone:'', email:'', postalCode:'', address:'', detailAddress:'',
            schoolId:null, schoolName:'', grade:'', memo:'', status:'PENDING',
            preferSms: true, preferEmail: false, preferPush: false, pushUserKey: ''
        });
        if (list.length>0) setSelectedId(list[0].id);
    };

    const createNewNow = async ()=>{
        const nf = newForm || {};
        const name = (nf.name||'').trim();
        if (!name) return safeInfo('안내','이름을 입력하세요.');
        const pw = (nf.password||'').trim();
        const login = (nf.loginId||'').trim();

        try{
            const created = await createStudent({
                name,
                schoolStage: nf.schoolStage || (stgCodes[0]?.code ?? 'E'),
                workLocationCode: nf.workLocationCode || (locCodes[0]?.code ?? 'N'),
                birthdate: nf.birthdate || null,
                gender: nf.gender || null,
                phone: nf.phone || null,
                email: nf.email || null,
                preferSms:   smsEnabled   ? (!!nf.preferSms   && !!String(nf.phone||'').trim())  : false,
                preferEmail: emailEnabled ? (!!nf.preferEmail && !!String(nf.email||'').trim())  : false,
                preferPush:  appEnabled   ? !!nf.preferPush  : false,
                pushUserKey: appEnabled   ? (nf.pushUserKey || null) : null,
                postalCode: nf.postalCode || null,
                address: nf.address || null,
                detailAddress: nf.detailAddress || null,
                status: 'PENDING',
                schoolId: nf.schoolId || null,
                // ✅ 핵심: 신규 생성도 gradeLabel 로 전송
                gradeLabel: nf.grade || null,
                memo: nf.memo || null
            });

            // 계정 생성/업데이트
            if (created?.id && (login || pw)){
                await upsertStudentAccount(created.id, {
                    loginId: login || null,
                    password: pw || null
                });
            }

            await safeOk('성공','학생이 생성되었습니다.');
            setCreating(false);
            await loadList(false);
            if (created?.id) setSelectedId(created.id);
        }catch(e){
            const st = e?.response?.status;
            if (st === 409)      safeError('중복','아이디가 중복되었습니다.');
            else if (st === 400) safeError('안내','비밀번호는 6자리 이상 등록해야합니다.');
            else                 safeError('오류', e?.response?.data?.message || '학생 생성 실패');
        }
    };

    // ===== 학교 검색 =====
    const doSearchSchool = async (forStageCode)=>{
        const st = (forStageCode||'').trim();
        if (!st) { setSchoolResults([]); return; }
        setSchoolLoading(true);
        try{
            const { listSchools } = await import('@/features/school/api/schoolAdminApi.js');
            const res = await listSchools(
                { stage: st, keyword: schoolQuery||undefined, active: true, size: 20, page: 0 },
                false
            );
            const rows = Array.isArray(res?.content) ? res.content : (Array.isArray(res)?res:[]);
            rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko',{sensitivity:'base'}));
            setSchoolResults(rows);
        }catch{
            setSchoolResults([]);
        }finally{
            setSchoolLoading(false);
        }
    };

    // ===== 형제 연결 =====
    const onLinkSibling = async (siblingStudent) => {
        if (!selectedId || !siblingStudent?.id) return;
        try {
            await linkSibling(selectedId, siblingStudent.id, '형제');
            await safeOk('성공', `${siblingStudent.name} 학생과 형제로 연결되었습니다.`);
            // 형제 탭 내부에서 onChanged 로 재조회
        } catch(e) {
            safeError('오류', e?.response?.data?.message || '형제 연결 실패');
        }
    };

    // ===== 빠른 메모 =====
    const addQuickMemo = async (contentText)=>{
        const txt = (contentText ?? memoText ?? '').trim();
        if (!selectedId) return;
        if (!txt) return safeInfo('안내', '메모 내용을 입력하세요.');
        try{
            const { addStudentMemo } = await import('@/features/student/api/studentMemoApi.js');
            await addStudentMemo(selectedId, { content: txt });
            setMemoText('');
            await safeOk('성공', '메모가 저장되었습니다.');
            await loadDetailWithMeta(selectedId);
            setMemoReloadTick(t=>t+1);
        }catch(e){
            safeError('오류', e?.response?.data?.message || '메모 저장 실패');
        }
    };

    // ---- 표시용 헬퍼 ----
    const detailPhotoUrl = buildPhotoSrc(detail);
    const photoSrc = detailPhotoUrl ? withBust(detailPhotoUrl, imgVersion) : '';
    const locName  = (c)=> (locCodes.find(x=>String(x.code).toUpperCase()===String(c||'').toUpperCase())?.name || c || '-');
    const stgName  = (c)=> (stgCodes.find(x=>String(x.code).toUpperCase()===String(c||'').toUpperCase())?.name || c || '-');
    const statusName = (c)=> (statusCodes.find(x=>String(x.code).toUpperCase()===String(c||'').toUpperCase())?.name || c || '-');

    // ========================================================================
    // 렌더
    // ========================================================================
    return (
        <section className="aa-page academy-page student-page">
            <div className="aa-container">
                {/* 상단 툴바 */}
                <div className="aa-toolbar">
                    <h1 className="aa-title">원생 관리</h1>
                    <div className="aa-toolbar-right">
                        <button className="aa-btn" onClick={startCreate}>신규 학생</button>
                        <button className="aa-btn" onClick={refreshAll}>새로고침</button>
                    </div>
                </div>

                {/* 30:70 grid */}
                <div className="aa-split">
                    {/* 좌: 목록/필터 */}
                    <div className="aa-card">
                        {/* 필터 */}
                        <div className="space-y-2 mb-3">
                            <div className="filter-row">
                                <div className="label">소속관</div>
                                <select className="aa-select" value={workLoc} onChange={e=>setWorkLoc(e.target.value)}>
                                    <option value="">전체</option>
                                    {sorted(locCodes).map(l=>(
                                        <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="filter-row">
                                <div className="label">학부</div>
                                <select className="aa-select" value={stage} onChange={e=>setStage(e.target.value)}>
                                    <option value="">전체</option>
                                    {sorted(stgCodes).map(s=>(
                                        <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <input
                                    className="aa-input w-full"
                                    placeholder="이름/연락처/이메일/아이디"
                                    value={keyword}
                                    onChange={e=>setKeyword(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* 목록 */}
                        {loading ? (
                            <div>불러오는 중…</div>
                        ) : (
                            <div className="aa-panel student-list-panel divide-y">
                                {list.length===0 && (
                                    <div className="p-3 text-slate-400">결과 없음</div>
                                )}
                                {list.map(row=>{
                                    const sel = (!creating && selectedId===row.id);
                                    const rowPhotoUrl = buildPhotoSrc(row);
                                    const src = rowPhotoUrl ? withBust(rowPhotoUrl, imgVersion) : '';
                                    return (
                                        <button
                                            key={row.id}
                                            type="button"
                                            className={`w-full flex items-center gap-3 p-3 text-left relative ${sel?'bg-slate-800 font-semibold':'hover:bg-slate-800/60'}`}
                                            onClick={()=>{
                                                setCreating(false);
                                                setSelectedId(row.id);
                                            }}
                                            aria-current={sel?'true':'false'}
                                        >
                                            {sel && (
                                                <span
                                                    aria-hidden
                                                    className="absolute left-0 top-0 h-full"
                                                    style={{width:3,background:'var(--aa-accent)'}}
                                                />
                                            )}
                                            <Avatar src={src} name={row.name} version={imgVersion}/>
                                            <div className="flex-1 min-w-0">
                                                <div className="truncate">
                                                    {row.name}
                                                    <span className="text-slate-400 font-normal">
                                                        {' '}({stgName(row.schoolStage)} · {locName(row.workLocationCode)})
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-400 truncate">
                                                    {row.phone || '-'} · {row.email || '-'}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 우: 상세 or 신규 */}
                    <div className="aa-card">
                        {/* 신규 등록 폼 */}
                        {creating ? (
                            <div className="space-y-4">
                                {/* 헤더 */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <Avatar size={80} name="신규"/>
                                        <div>
                                            <div className="text-lg font-semibold">신규 학생 등록</div>
                                            <div className="text-sm text-slate-400">
                                                아이디와 비밀번호를 함께 입력하면, 생성 직후 계정을 세팅합니다.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="aa-btn" onClick={cancelCreate}>취소</button>
                                        <button className="aa-btn aa-btn-primary" onClick={createNewNow}>생성</button>
                                    </div>
                                </div>

                                {/* ======= 폼 레이아웃 ======= */}
                                <div className="space-y-4">
                                    {/* 1) 아이디 / 비밀번호 / 상태 */}
                                    <div className="grid md:grid-cols-3 gap-3">
                                        <Field label="아이디(로그인 ID)">
                                            <input
                                                className="aa-input"
                                                value={newForm.loginId}
                                                onChange={e=>setNewForm(f=>({...f, loginId: e.target.value}))}
                                                placeholder="예: student01"
                                            />
                                        </Field>
                                        <Field label="비밀번호">
                                            <input
                                                type="password"
                                                className="aa-input"
                                                value={newForm.password}
                                                onChange={e=>setNewForm(f=>({...f, password: e.target.value}))}
                                                placeholder="6자 이상"
                                            />
                                        </Field>
                                        <Field label="상태">
                                            <RO>{statusName(newForm.status)}</RO>
                                        </Field>
                                    </div>

                                    {/* 2) 이름 / 생년월일 / 성별 */}
                                    <div className="grid md:grid-cols-3 gap-3">
                                        <Field label="이름">
                                            <input
                                                className="aa-input"
                                                value={newForm.name}
                                                onChange={e=>setNewForm(f=>({...f, name:e.target.value}))}
                                            />
                                        </Field>
                                        <Field label="생년월일">
                                            {/* 연도 4자리 제한 */}
                                            <input
                                                className="aa-input"
                                                type="date"
                                                max="9999-12-31"
                                                value={newForm.birthdate || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val && val.split('-')[0].length > 4) return;
                                                    setNewForm(f => ({ ...f, birthdate: val }));
                                                }}
                                            />
                                        </Field>
                                        <Field label="성별">
                                            <select
                                                className="aa-select"
                                                value={newForm.gender}
                                                onChange={e=>setNewForm(f=>({...f, gender:e.target.value}))}
                                            >
                                                <option value="">선택</option>
                                                <option value="m">남</option>
                                                <option value="f">여</option>
                                                <option value="o">기타</option>
                                            </select>
                                        </Field>
                                    </div>

                                    {/* 소속 관 */}
                                    <div className="grid md:grid-cols-3 gap-3">
                                        <Field label="소속 관">
                                            <select
                                                className="aa-select"
                                                value={newForm.workLocationCode}
                                                onChange={e=>setNewForm(f=>({...f, workLocationCode:e.target.value}))}
                                            >
                                                <option value="">선택</option>
                                                {sorted(locCodes).map(l=>(
                                                    <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                                                ))}
                                            </select>
                                        </Field>
                                    </div>

                                    {/* 3) 학부 / 학교 / 학년 */}
                                    <div className="grid md:grid-cols-3 gap-3">
                                        <Field label="학부">
                                            <select
                                                className="aa-select"
                                                value={newForm.schoolStage}
                                                onChange={e=>{
                                                    const v = e.target.value;
                                                    setNewForm(f=>({
                                                        ...f,
                                                        schoolStage:v,
                                                        grade:'',
                                                        schoolId:null,
                                                        schoolName:''
                                                    }));
                                                }}
                                            >
                                                <option value="">선택</option>
                                                {sorted(stgCodes).map(s=>(
                                                    <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                                                ))}
                                            </select>
                                        </Field>
                                        <Field label="학교">
                                            <div className="flex gap-2">
                                                <input
                                                    className="aa-input flex-1"
                                                    placeholder="선택된 학교"
                                                    value={newForm.schoolName||''}
                                                    readOnly
                                                />
                                                <button
                                                    className="aa-btn"
                                                    onClick={()=>{
                                                        if(!newForm.schoolStage)
                                                            return safeInfo('안내','먼저 학부를 선택하세요.');
                                                        setSchoolQuery('');
                                                        setSchoolResults([]);
                                                        setSchoolPickOpen(true);
                                                    }}
                                                >
                                                    학교 선택
                                                </button>
                                            </div>
                                        </Field>
                                        <Field label="학년">
                                            <select
                                                className="aa-select"
                                                value={newForm.grade||''}
                                                onChange={e=>setNewForm(f=>({...f, grade:e.target.value}))}
                                                disabled={!newForm.schoolStage}
                                            >
                                                <option value="">선택</option>
                                                {gradesForStage(newForm.schoolStage).map(n=>(
                                                    <option key={n} value={String(n)}>{n}학년</option>
                                                ))}
                                            </select>
                                        </Field>
                                    </div>

                                    {/* 4) 연락처 / 이메일 */}
                                    <div className="grid md:grid-cols-2 gap-3">
                                        <Field label="연락처">
                                            <input
                                                className="aa-input"
                                                value={newForm.phone||''}
                                                onChange={e=>setNewForm(f=>({...f, phone:e.target.value}))}
                                            />
                                        </Field>
                                        <Field label="이메일">
                                            <input
                                                className="aa-input"
                                                value={newForm.email||''}
                                                onChange={e=>setNewForm(f=>({...f, email:e.target.value}))}
                                            />
                                        </Field>
                                    </div>

                                    {/* 알림 동의 */}
                                    {(smsEnabled || emailEnabled || appEnabled) && (
                                        <div className="grid md:grid-cols-3 gap-3">
                                            <Field label="문자(SMS) 동의">
                                                <label className="inline-flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!newForm.preferSms}
                                                        onChange={e=>setNewForm(f=>({...f, preferSms: e.target.checked}))}
                                                    />
                                                    <span className="text-sm text-slate-300">동의</span>
                                                </label>
                                            </Field>
                                            <Field label="이메일 동의">
                                                <label className="inline-flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!newForm.preferEmail}
                                                        onChange={e=>setNewForm(f=>({...f, preferEmail: e.target.checked}))}
                                                    />
                                                    <span className="text-sm text-slate-300">동의</span>
                                                </label>
                                            </Field>
                                            <Field label="앱 푸시 동의">
                                                <label className="inline-flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!newForm.preferPush}
                                                        onChange={e=>setNewForm(f=>({...f, preferPush: e.target.checked}))}
                                                    />
                                                    <span className="text-sm text-slate-300">동의</span>
                                                </label>
                                            </Field>
                                        </div>
                                    )}
                                    {appEnabled && (
                                        <div className="grid md:grid-cols-3 gap-3">
                                            <Field label="Push User Key (선택)">
                                                <input
                                                    className="aa-input"
                                                    value={newForm.pushUserKey||''}
                                                    onChange={e=>setNewForm(f=>({...f, pushUserKey: e.target.value}))}
                                                    placeholder="푸시 식별자(있을 때만)"
                                                />
                                            </Field>
                                        </div>
                                    )}

                                    {/* 5~6) 주소 */}
                                    <div className="grid md:grid-cols-12 gap-3">
                                        <div className="md:col-span-3">
                                            <Field label="우편번호">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        className="aa-input w-24 sm:w-28 md:w-32"
                                                        value={newForm.postalCode || ''}
                                                        onChange={e => setNewForm(f => ({
                                                            ...f,
                                                            postalCode: e.target.value.replace(/[^0-9]/g, '').slice(0, 5)
                                                        }))}
                                                        maxLength={5}
                                                        inputMode="numeric"
                                                    />
                                                    <AddressSearch
                                                        onComplete={({ postalCode, address }) =>
                                                            setNewForm(f => ({
                                                                ...f,
                                                                postalCode: postalCode || '',
                                                                address: address || ''
                                                            }))
                                                        }
                                                        className="aa-btn aa-btn-primary"
                                                        buttonLabel="우편번호 검색"
                                                    />
                                                </div>
                                            </Field>
                                        </div>
                                        <div className="md:col-span-5">
                                            <Field label="주소">
                                                <input
                                                    className="aa-input"
                                                    value={newForm.address || ''}
                                                    readOnly
                                                />
                                            </Field>
                                        </div>
                                        <div className="md:col-span-4">
                                            <Field label="상세주소">
                                                <input
                                                    className="aa-input"
                                                    value={newForm.detailAddress || ''}
                                                    onChange={e => setNewForm(f => ({
                                                        ...f,
                                                        detailAddress: e.target.value
                                                    }))}
                                                />
                                            </Field>
                                        </div>
                                    </div>

                                    {/* 7) 메모(비고/요약메모) */}
                                    <div>
                                        <Field label="비고(요약메모)">
                                            <textarea
                                                className="aa-textarea"
                                                rows={4}
                                                value={newForm.memo||''}
                                                onChange={e=>setNewForm(f=>({...f, memo:e.target.value}))}
                                                placeholder="해당 학생에 대한 간단한 비고/요약 메모를 남겨주세요."
                                            />
                                        </Field>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // ===== 상세 보기/수정 =====
                            <>
                                {!detail ? (
                                    <div>좌측에서 대상을 선택하세요.</div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* 헤더 */}
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4">
                                                <div>
                                                    {!editing ? (
                                                        <Avatar
                                                            size={80}
                                                            src={photoSrc}
                                                            name={detail.name}
                                                            version={imgVersion}
                                                            onClick={()=>{
                                                                const id = detail?.profileImageId;
                                                                const name = detail?.name || '';
                                                                const url = photoSrc || undefined;
                                                                try { openPreview(id, name, url); }
                                                                catch { try { openPreview(id, name); } catch {} }
                                                            }}
                                                            className="cursor-zoom-in"
                                                        />
                                                    ) : (
                                                        <Avatar
                                                            size={80}
                                                            src={photoSrc}
                                                            name={detail.name}
                                                            version={imgVersion}
                                                        />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-lg font-semibold">{detail.name}</div>
                                                    <div className="text-xs text-slate-400 space-y-0.5 mt-1">
                                                        <div>
                                                            최초 등록일 : <b>{detail.createdAt || '-'}</b>
                                                            {' '}|{' '}
                                                            최초 등록자 : <b>{detail.createdByName || '-'}</b>
                                                        </div>
                                                        <div>
                                                            최근 수정일 : <b>{detail.updatedAt || '-'}</b>
                                                            {' '}|{' '}
                                                            최근 수정자 : <b>{detail.updatedByName || '-'}</b>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-slate-400 mt-2">
                                                        아이디: {detail.loginId || (detail.userId ? `#${detail.userId}` : '-')}
                                                    </div>
                                                    {editing && (
                                                        <label className="inline-block mt-2">
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                onChange={onUploadPhoto}
                                                            />
                                                            <span className="px-3 py-1 rounded bg-slate-800 border cursor-pointer">
                                                                사진 변경
                                                            </span>
                                                        </label>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 justify-end">
                                                <button
                                                    className="aa-btn"
                                                    type="button"
                                                    aria-expanded={!infoCollapsed}
                                                    aria-controls="student-detail-collapsible"
                                                    title={infoCollapsed ? '상세 펼치기' : '상세 접기'}
                                                    onClick={()=>setInfoCollapsed(v=>!v)}
                                                >
                                                    {infoCollapsed ? '상세 펼치기' : '상세 접기'}
                                                </button>
                                                {!editing ? (
                                                    <>
                                                        {detail.status==='PENDING' && (
                                                            <button
                                                                className="aa-btn aa-btn-primary"
                                                                onClick={async ()=>{
                                                                    try{
                                                                        await updateStudent(selectedId, { status:'ACTIVE' });
                                                                        const merged = await loadDetailWithMeta(selectedId);
                                                                        await safeOk('성공','활성화되었습니다.');
                                                                        if (merged) await loadEnrollsOnly(selectedId);
                                                                    }catch(e){
                                                                        safeError('오류', e?.response?.data?.message || '활성화 실패');
                                                                    }
                                                                }}
                                                            >
                                                                활성화
                                                            </button>
                                                        )}
                                                        <button
                                                            className="aa-btn"
                                                            onClick={()=>setQuickMemoOpen(true)}
                                                        >
                                                            메모 남기기
                                                        </button>
                                                        <button
                                                            className="aa-btn"
                                                            onClick={()=>setPwOpen(true)}
                                                        >
                                                            비밀번호 변경
                                                        </button>
                                                        <button
                                                            className="aa-btn aa-btn-danger"
                                                            onClick={async ()=>{
                                                                const ok = await confirmDialog(
                                                                    '확인',
                                                                    '학생을 삭제할까요? 이 작업은 되돌릴 수 없습니다.',
                                                                    { confirmText: '삭제' }
                                                                );
                                                                if (!ok) return;
                                                                try{
                                                                    await deleteStudent(selectedId);
                                                                    await safeOk('성공','삭제되었습니다.');
                                                                    await loadList(false);
                                                                }catch(e){
                                                                    safeError('오류', e?.response?.data?.message || '삭제 실패');
                                                                }
                                                            }}
                                                        >
                                                            삭제
                                                        </button>
                                                        <button
                                                            className="aa-btn aa-btn-primary"
                                                            onClick={()=>setEditing(true)}
                                                        >
                                                            수정
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            className="aa-btn"
                                                            onClick={()=>{
                                                                setEdit(toEdit(detail));
                                                                setEditing(false);
                                                            }}
                                                        >
                                                            취소
                                                        </button>
                                                        <button
                                                            className="aa-btn aa-btn-primary"
                                                            disabled={saving}
                                                            onClick={onSave}
                                                        >
                                                            {saving?'저장 중…':'저장'}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* ======= 상세 폼 ======= */}
                                        <div className="space-y-4">
                                            {/* 1) 아이디 / 비밀번호 / 상태 */}
                                            <div className="grid md:grid-cols-3 gap-3">
                                                <Field label="아이디">
                                                    <RO>{detail.loginId || (detail.userId ? `#${detail.userId}` : '-')}</RO>
                                                </Field>
                                                <Field label="비밀번호">
                                                    {!editing ? (
                                                        <RO>•••••• (상단 버튼으로 변경)</RO>
                                                    ) : (
                                                        <RO>상단 "비밀번호 변경"을 사용하세요</RO>
                                                    )}
                                                </Field>
                                                <Field label="상태">
                                                    {!editing ? (
                                                        <RO>{statusName(detail.status)}</RO>
                                                    ) : (
                                                        <select
                                                            className="aa-select"
                                                            value={edit.status}
                                                            onChange={e=>setEdit(f=>({...f, status:e.target.value}))}
                                                        >
                                                            {sorted(statusCodes).map(s=>(
                                                                <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </Field>
                                            </div>

                                            {/* 2) 이름 / 생년월일 / 성별 / 소속관 */}
                                            <div className="grid md:grid-cols-3 gap-3">
                                                <Field label="이름">
                                                    {!editing ? (
                                                        <RO>{detail.name}</RO>
                                                    ) : (
                                                        <input
                                                            className="aa-input"
                                                            value={edit.name}
                                                            onChange={e=>setEdit(f=>({...f,name:e.target.value}))}
                                                        />
                                                    )}
                                                </Field>
                                                <Field label="생년월일">
                                                    {!editing ? (
                                                        <RO>{detail.birthdate || '-'}</RO>
                                                    ) : (
                                                        <input
                                                            className="aa-input"
                                                            type="date"
                                                            max="9999-12-31"
                                                            value={edit.birthdate||''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                if (val && val.split('-')[0].length > 4) return;
                                                                setEdit(f => ({ ...f, birthdate: val }));
                                                            }}
                                                        />
                                                    )}
                                                </Field>
                                                <Field label="성별">
                                                    {!editing ? (
                                                        <RO>
                                                            {detail.gender === 'm' ? '남'
                                                                : detail.gender === 'f' ? '여'
                                                                    : (detail.gender || '-')}
                                                        </RO>
                                                    ) : (
                                                        <select
                                                            className="aa-select"
                                                            value={edit.gender || ''}
                                                            onChange={e=>setEdit(f=>({...f, gender:e.target.value}))}
                                                        >
                                                            <option value="">선택</option>
                                                            <option value="m">남</option>
                                                            <option value="f">여</option>
                                                            <option value="o">기타</option>
                                                        </select>
                                                    )}
                                                </Field>
                                            </div>
                                            <div className="grid md:grid-cols-3 gap-3">
                                                <Field label="소속 관">
                                                    {!editing ? (
                                                        <RO>{locName(detail.workLocationCode)}</RO>
                                                    ) : (
                                                        <select
                                                            className="aa-select"
                                                            value={edit.workLocationCode}
                                                            onChange={e=>setEdit(f=>({...f,workLocationCode:e.target.value}))}
                                                        >
                                                            {sorted(locCodes).map(l=>(
                                                                <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </Field>
                                            </div>

                                            {/* ===== 접힘 대상: 학부 ~ 상세주소 ===== */}
                                            <div
                                                id="student-detail-collapsible"
                                                hidden={infoCollapsed}
                                                className="space-y-4"
                                            >
                                                {/* 3) 학부 / 학교 / 학년 */}
                                                <div className="grid md:grid-cols-3 gap-3">
                                                    <Field label="학부">
                                                        {!editing ? (
                                                            <RO>{stgName(detail.schoolStage)}</RO>
                                                        ) : (
                                                            <select
                                                                className="aa-select"
                                                                value={edit.schoolStage}
                                                                onChange={e=>{
                                                                    const v = e.target.value;
                                                                    setEdit(f=>({
                                                                        ...f,
                                                                        schoolStage:v,
                                                                        grade:'',
                                                                        schoolId:null,
                                                                        schoolName:''
                                                                    }));
                                                                }}
                                                            >
                                                                {sorted(stgCodes).map(s=>(
                                                                    <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </Field>
                                                    <Field label="학교">
                                                        {!editing ? (
                                                            <RO>{detail.schoolName || detail?.school?.name || '-'}</RO>
                                                        ) : (
                                                            <div className="flex gap-2">
                                                                <input
                                                                    className="aa-input flex-1"
                                                                    value={edit.schoolName||''}
                                                                    readOnly
                                                                    placeholder="선택된 학교"
                                                                />
                                                                <button
                                                                    className="aa-btn"
                                                                    onClick={()=>{
                                                                        if(!edit.schoolStage)
                                                                            return safeInfo('안내','먼저 학부를 선택하세요.');
                                                                        setSchoolQuery('');
                                                                        setSchoolResults([]);
                                                                        setSchoolPickOpen(true);
                                                                    }}
                                                                >
                                                                    학교 선택
                                                                </button>
                                                            </div>
                                                        )}
                                                    </Field>
                                                    <Field label="학년">
                                                        {!editing ? (
                                                            <RO>
                                                                {detail.gradeLabel ? `${detail.gradeLabel}학년` : '-'}
                                                            </RO>
                                                        ) : (
                                                            <select
                                                                className="aa-select"
                                                                value={edit.grade||''}
                                                                onChange={e=>setEdit(f=>({...f, grade:e.target.value}))}
                                                                disabled={!edit.schoolStage}
                                                            >
                                                                <option value="">선택</option>
                                                                {gradesForStage(edit.schoolStage).map(n=>(
                                                                    <option key={n} value={String(n)}>{n}학년</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </Field>
                                                </div>

                                                {/* 4) 연락처 / 이메일 */}
                                                <div className="grid md:grid-cols-2 gap-3">
                                                    <Field label="연락처">
                                                        {!editing ? (
                                                            <RO>{detail.phone || '-'}</RO>
                                                        ) : (
                                                            <input
                                                                className="aa-input"
                                                                value={edit.phone||''}
                                                                onChange={e=>setEdit(f=>({...f,phone:e.target.value}))}
                                                            />
                                                        )}
                                                    </Field>
                                                    <Field label="이메일">
                                                        {!editing ? (
                                                            <RO>{detail.email || '-'}</RO>
                                                        ) : (
                                                            <input
                                                                className="aa-input"
                                                                value={edit.email||''}
                                                                onChange={e=>setEdit(f=>({...f,email:e.target.value}))}
                                                            />
                                                        )}
                                                    </Field>
                                                </div>

                                                {/* 알림 동의 */}
                                                {(smsEnabled || emailEnabled || appEnabled) && (
                                                    <div className="grid md:grid-cols-3 gap-3">
                                                        {smsEnabled && (
                                                            <Field label="문자(SMS) 동의">
                                                                {!editing ? (
                                                                    <RO>{detail.preferSms ? '동의' : '미동의'}</RO>
                                                                ) : (
                                                                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-800">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!edit.preferSms}
                                                                            onChange={e=>setEdit(f=>({...f, preferSms: e.target.checked}))}
                                                                        />
                                                                        <span className="text-sm">동의</span>
                                                                    </label>
                                                                )}
                                                            </Field>
                                                        )}
                                                        {emailEnabled && (
                                                            <Field label="이메일 동의">
                                                                {!editing ? (
                                                                    <RO>{detail.preferEmail ? '동의' : '미동의'}</RO>
                                                                ) : (
                                                                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-800">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!edit.preferEmail}
                                                                            onChange={e=>setEdit(f=>({...f, preferEmail: e.target.checked}))}
                                                                        />
                                                                        <span className="text-sm">동의</span>
                                                                    </label>
                                                                )}
                                                            </Field>
                                                        )}
                                                        {appEnabled && (
                                                            <Field label="앱 푸시 동의">
                                                                {!editing ? (
                                                                    <RO>{detail.preferPush ? '동의' : '미동의'}</RO>
                                                                ) : (
                                                                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-800">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!edit.preferPush}
                                                                            onChange={e=>setEdit(f=>({...f, preferPush: e.target.checked}))}
                                                                        />
                                                                        <span className="text-sm">동의</span>
                                                                    </label>
                                                                )}
                                                            </Field>
                                                        )}
                                                    </div>
                                                )}
                                                {appEnabled && (
                                                    <div className="grid md:grid-cols-3 gap-3">
                                                        <Field label="Push User Key (선택)">
                                                            {!editing ? (
                                                                <RO>{detail.pushUserKey || '-'}</RO>
                                                            ) : (
                                                                <input
                                                                    className="aa-input"
                                                                    value={edit.pushUserKey||''}
                                                                    onChange={e=>setEdit(f=>({...f, pushUserKey: e.target.value}))}
                                                                    placeholder="푸시 식별자(있을 때만)"
                                                                />
                                                            )}
                                                        </Field>
                                                    </div>
                                                )}

                                                {/* 5~6) 주소 */}
                                                <div className="grid md:grid-cols-12 gap-3">
                                                    <div className="md:col-span-3">
                                                        <Field label="우편번호">
                                                            {!editing ? (
                                                                <RO>{detail.postalCode || '-'}</RO>
                                                            ) : (
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        className="aa-input w-24 sm:w-28 md:w-32"
                                                                        value={edit.postalCode || ''}
                                                                        onChange={e => setEdit(f => ({
                                                                            ...f,
                                                                            postalCode: e.target.value.replace(/[^0-9]/g, '').slice(0, 5)
                                                                        }))}
                                                                        maxLength={5}
                                                                        inputMode="numeric"
                                                                    />
                                                                    <AddressSearch
                                                                        onComplete={({ postalCode, address }) =>
                                                                            setEdit(f => ({
                                                                                ...f,
                                                                                postalCode: postalCode || '',
                                                                                address: address || ''
                                                                            }))
                                                                        }
                                                                        className="aa-btn aa-btn-primary"
                                                                        buttonLabel="우편번호 검색"
                                                                    />
                                                                </div>
                                                            )}
                                                        </Field>
                                                    </div>
                                                    <div className="md:col-span-5">
                                                        <Field label="주소">
                                                            {!editing ? (
                                                                <RO>{detail.address || '-'}</RO>
                                                            ) : (
                                                                <input
                                                                    className="aa-input"
                                                                    value={edit.address || ''}
                                                                    readOnly
                                                                />
                                                            )}
                                                        </Field>
                                                    </div>
                                                    <div className="md:col-span-4">
                                                        <Field label="상세주소">
                                                            {!editing ? (
                                                                <RO>{detail.detailAddress || '-'}</RO>
                                                            ) : (
                                                                <input
                                                                    className="aa-input"
                                                                    value={edit.detailAddress || ''}
                                                                    onChange={e => setEdit(f => ({
                                                                        ...f,
                                                                        detailAddress: e.target.value
                                                                    }))}
                                                                />
                                                            )}
                                                        </Field>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 7) 비고 — 접힘과 무관하게 항상 표시 */}
                                            <div>
                                                <Field label="비고(요약메모)">
                                                    <RO>{detail.memo || '-'}</RO>
                                                </Field>
                                            </div>
                                        </div>

                                        {/* 하단 탭 */}
                                        {!editing && (
                                            <div className="border-t border-slate-700 pt-3">
                                                <div className="aa-seg mb-3">
                                                    <button
                                                        className={tab==='ENROLL'?'active':''}
                                                        onClick={()=>setTab('ENROLL')}
                                                    >
                                                        반 배정
                                                    </button>
                                                    <button
                                                        className={tab==='TUITION'?'active':''}
                                                        onClick={()=>setTab('TUITION')}
                                                    >
                                                        수강료
                                                    </button>
                                                    <button
                                                        className={tab==='CONSULT'?'active':''}
                                                        onClick={()=>setTab('CONSULT')}
                                                    >
                                                        상담
                                                    </button>
                                                    <button
                                                        className={tab==='MEMO'?'active':''}
                                                        onClick={()=>setTab('MEMO')}
                                                    >
                                                        메모
                                                    </button>
                                                    <button
                                                        className={tab==='FAMILY'?'active':''}
                                                        onClick={()=>setTab('FAMILY')}
                                                    >
                                                        가족
                                                    </button>
                                                    <button
                                                        className={tab==='SIBLING'?'active':''}
                                                        onClick={()=>setTab('SIBLING')}
                                                    >
                                                        형제
                                                    </button>
                                                </div>

                                                {/* 각 탭 컨텐츠 */}
                                                {tab==='ENROLL' && (
                                                    <StudentEnrollments
                                                        studentId={selectedId}
                                                        studentDetail={detail}
                                                        enrolls={enrolls}
                                                        enrollStatusCodes={enrollStatusCodes}
                                                        onReload={async ()=>{ await loadEnrollsOnly(selectedId); }}
                                                    />
                                                )}
                                                {tab==='TUITION' && (
                                                    <StudentTuitionTab
                                                        studentId={selectedId}
                                                        studentDetail={detail}
                                                        onChanged={refreshAll}
                                                    />
                                                )}
                                                {tab==='CONSULT' && (
                                                    <StudentConsults studentId={selectedId} />
                                                )}
                                                {tab==='MEMO' && (
                                                    <StudentMemoTab
                                                        studentId={selectedId}
                                                        disabled={editing}
                                                        reloadTick={memoReloadTick}
                                                        onChanged={async ()=>{ await loadDetailWithMeta(selectedId); }}
                                                    />
                                                )}
                                                {tab==='FAMILY' && (
                                                    <StudentFamilyTab
                                                        studentId={selectedId}
                                                        familyRelCodes={familyRelCodes}
                                                        onChanged={refreshAll}
                                                    />
                                                )}
                                                {tab==='SIBLING' && (
                                                    <StudentSiblingTab
                                                        studentId={selectedId}
                                                        onChanged={refreshAll}
                                                        stageCodes={stgCodes}
                                                        locCodes={locCodes}
                                                        statusCodes={statusCodes}
                                                        onOpenSiblingPicker={() => setSiblingPickOpen(true)}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* 모달: 학교 검색 */}
            {schoolPickOpen && (
                <Modal
                    title="학교 검색"
                    onClose={()=>setSchoolPickOpen(false)}
                    size="2xl"
                >
                    <div className="space-y-3">
                        <div className="text-slate-300">
                            학부:{' '}
                            <b>
                                {(creating
                                        ? stgCodes.find(x=>x.code===newForm.schoolStage)?.name
                                        : stgCodes.find(x=>x.code===edit?.schoolStage)?.name
                                ) || '-'}
                            </b>
                        </div>
                        <div className="flex gap-2">
                            <input
                                className="aa-input flex-1"
                                placeholder="학교명/주소"
                                value={schoolQuery}
                                onChange={e=>setSchoolQuery(e.target.value)}
                            />
                            <button
                                className="aa-btn"
                                disabled={schoolLoading}
                                onClick={()=>doSearchSchool(creating ? newForm.schoolStage : edit?.schoolStage)}
                            >
                                {schoolLoading?'검색…':'검색'}
                            </button>
                        </div>
                        <div className="aa-table-wrap max-h-[60vh] overflow-auto">
                            <table className="aa-table">
                                <thead>
                                <tr>
                                    <th>학교명</th>
                                    <th>주소</th>
                                    <th style={{width:80}}></th>
                                </tr>
                                </thead>
                                <tbody>
                                {schoolResults.length===0 && (
                                    <tr><td colSpan={3}>검색 결과가 없습니다.</td></tr>
                                )}
                                {schoolResults.map(s=>(
                                    <tr key={s.id}>
                                        <td>{s.name}</td>
                                        <td className="aa-ellipsis">
                                            {s.address||s.detailAddress||'-'}
                                        </td>
                                        <td>
                                            <button
                                                className="aa-btn aa-btn-primary aa-btn-sm"
                                                onClick={()=>{
                                                    if (creating){
                                                        setNewForm(f=>({...f, schoolId:s.id, schoolName:s.name}));
                                                    }else{
                                                        setEdit(f=>({...f, schoolId:s.id, schoolName:s.name}));
                                                    }
                                                    setSchoolPickOpen(false);
                                                }}
                                            >
                                                선택
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Modal>
            )}

            {/* 모달: 형제 검색 */}
            {siblingPickOpen && (
                <StudentSearchModal
                    open={siblingPickOpen}
                    onClose={() => setSiblingPickOpen(false)}
                    onSelect={onLinkSibling}
                    excludeId={selectedId}
                    title="형제로 연결할 학생 검색"
                    stageCodes={stgCodes}
                    locCodes={locCodes}
                    statusCodes={statusCodes}
                />
            )}

            {/* 모달: 비밀번호 변경 */}
            <PwModal
                openState={{pwOpen,setPwOpen}}
                onChangePassword={async (pw)=>{
                    if (!selectedId) return;
                    if ((pw||'').trim().length < 6)
                        return safeInfo('안내','비밀번호는 6자리 이상이어야 합니다.');
                    try{
                        await changeStudentPassword(selectedId, pw);
                        await safeOk('성공','비밀번호가 변경되었습니다.');
                    }catch(e){
                        const st = e?.response?.status;
                        if (st===400)
                            safeError('안내','비밀번호는 6자리 이상 등록해야합니다.');
                        else
                            safeError('오류', e?.response?.data?.message || '비밀번호 변경 실패');
                    }
                }}
            />

            {/* 빠른 메모 모달 */}
            <QuickMemoModal
                open={quickMemoOpen}
                onClose={()=>setQuickMemoOpen(false)}
                onSubmit={async (txt)=>{
                    await addQuickMemo(txt);
                    setQuickMemoOpen(false);
                }}
            />

            {/* 이미지 프리뷰 */}
            {PreviewPortal}
        </section>
    );
}

// ============================================================================
// isCodeEnabled 헬퍼 함수
// ============================================================================
/**
 * DB common_code.enabled (1/0, '1'/'0', true/false, null → true)
 * @param {object} item
 * @returns {boolean}
 */
function isCodeEnabled(item) {
    const v = item?.enabled;
    if (v === undefined || v === null) return true;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    const s = String(v).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'y';
}

// ============================================================================
// 프리젠테이션 컴포넌트들 (로컬)
// ============================================================================
function Field({label, children}){
    return (
        <label className="block">
            <div className="text-sm mb-1 text-slate-300">{label}</div>
            {children}
        </label>
    );
}

function RO({children}){
    return (
        <div className="px-3 py-2 rounded border border-slate-700 bg-slate-800">
            {children ?? '-'}
        </div>
    );
}

// 비밀번호 변경 모달
function PwModal({openState, onChangePassword}){
    const {pwOpen,setPwOpen} = openState;
    const [pwForm, setPwForm] = useState({ pw:'', pw2:'' });
    const [saving, setSaving] = useState(false);
    if(!pwOpen) return null;
    return (
        <Modal title="비밀번호 변경" onClose={()=>setPwOpen(false)}>
            <div className="space-y-3">
                <div>
                    <div className="text-sm mb-1">새 비밀번호</div>
                    <input
                        type="password"
                        className="aa-input aa-input-contrast w-full"
                        placeholder="새 비밀번호"
                        value={pwForm.pw}
                        onChange={(e)=>setPwForm(f=>({...f, pw:e.target.value}))}
                    />
                </div>
                <div>
                    <div className="text-sm mb-1">새 비밀번호 확인</div>
                    <input
                        type="password"
                        className="aa-input aa-input-contrast w-full"
                        placeholder="새 비밀번호 확인"
                        value={pwForm.pw2}
                        onChange={(e)=>setPwForm(f=>({...f, pw2:e.target.value}))}
                    />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <button
                        className="aa-btn"
                        onClick={()=>setPwOpen(false)}
                        disabled={saving}
                    >
                        취소
                    </button>
                    <button
                        className="aa-btn aa-btn-primary"
                        disabled={saving}
                        onClick={async ()=>{
                            const p1 = (pwForm.pw||'').trim();
                            const p2 = (pwForm.pw2||'').trim();
                            if (p1.length < 6)
                                return alertInfo('안내','비밀번호는 6자리 이상이어야 합니다.');
                            if (p1 !== p2)
                                return alertInfo('안내','비밀번호가 일치하지 않습니다.');
                            try{
                                setSaving(true);
                                await onChangePassword(p1);
                                setPwOpen(false);
                                setPwForm({pw:'', pw2:''});
                            }finally{
                                setSaving(false);
                            }
                        }}
                    >
                        {saving?'변경 중…':'변경'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// 빠른 메모 모달
function QuickMemoModal({open, onClose, onSubmit}){
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(()=>{
        if(open){
            setText('');
            setSaving(false);
        }
    },[open]);
    if(!open) return null;
    return (
        <Modal title="메모 남기기" onClose={onClose}>
            <div className="space-y-3">
                <textarea
                    className="aa-textarea w-full"
                    rows={5}
                    placeholder="히스토리에 남길 메모를 입력하세요."
                    value={text}
                    onChange={e=>setText(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                    <button
                        className="aa-btn"
                        onClick={onClose}
                        disabled={saving}
                    >
                        취소
                    </button>
                    <button
                        className="aa-btn aa-btn-primary"
                        disabled={saving || !text.trim()}
                        onClick={async ()=>{
                            try{
                                setSaving(true);
                                await onSubmit(text.trim());
                            }finally{
                                setSaving(false);
                            }
                        }}
                    >
                        {saving?'저장 중…':'저장'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
