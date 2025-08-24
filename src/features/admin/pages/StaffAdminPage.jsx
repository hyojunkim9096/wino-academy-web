// src/main/react/StaffAdminPage.jsx
// 직원 관리 화면
// - 좌측 목록: 이름 오름차순 정렬
// - 우측 상세: 아바타 클릭 시 이미지 확대 모달
// - 검색 디바운스, 저장/업로드 후 목록/상세 동기화
// - ✅ 구분(EmployeeType: STAFF/TEACHER) 수정 가능
// - ✅ 사진 경로 처리: photoUrl 우선, 없으면 photoPath → /uploads/** 로 변환
// - ✅ 캐시버스터로 업로드 직후 새 이미지 보장

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listStaffs, getStaff, updateStaff, changeStaffPassword, uploadStaffPhoto } from '@/api/staffApi';
import { getCodes } from '@/api/commonCodeAdminApi';
import { alertError, alertInfo, alertSuccess } from '@/ui/alert';
import Modal from '@/components/ui/Modal';            // 공통 모달
import Avatar from '@/components/ui/Avatar';          // 공통 아바타(아래에서 src도 함께 전달)
import { useImagePreview } from '@/components/ui/ImagePreview'; // 프리뷰 훅(최신 버전은 url 인자를 지원)
import { uploadsUrl, withBust } from '@/utils/mediaUrl';        // ✅ /uploads URL 빌더 + 캐시버스터
import '@/styles/admin.css';
import '@/styles/admin-staff.css';
import '@/styles/admin-system.css'; // ✅ 항상 마지막에(다크 테마/배경 플리커 방지)

const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

const EMP_TYPES = [
    { key: 'ALL',     label: '전체' },
    { key: 'TEACHER', label: '강사' },
    { key: 'STAFF',   label: '직원' },
];

// 유틸: 코드배열 → Map, 정렬
const toMap  = (arr=[]) => Object.fromEntries(arr.map(x => [String(x.code).trim().toUpperCase(), x]));
const sorted = (arr=[]) => arr.slice().sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || String(a.name).localeCompare(b.name,'ko'));

/** ✅ 사진 URL 계산
 * 1) 서버 DTO가 photoUrl을 주면 그대로 사용 (가장 안전)
 * 2) 아니면 photoPath(절대/상대 모두 허용) → /uploads/** 로 변환
 * 3) (백엔드가 fileId만 주는 구버전 호환) fileId가 있고 photoUrl/Path가 없으면 null 반환 → Avatar의 fileId 처리에 위임
 */
function buildPhotoSrc(row){
    if (!row) return '';
    if (row.photoUrl) return row.photoUrl;
    if (row.photoPath) return uploadsUrl(row.photoPath); // 절대/상대 자동 정규화
    return ''; // fileId만 있는 경우는 Avatar가 자체 처리(구버전 호환)
}

export default function StaffAdminPage() {
    // ===== 필터 =====
    const [empType, setEmpType]   = useState('ALL');
    const [workLoc, setWorkLoc]   = useState('');
    const [keyword, setKeyword]   = useState('');
    const [kwDebounced, setKwDebounced] = useState('');

    // ===== 공통코드 =====
    const [roleCodes,   setRoleCodes]   = useState([]);
    const [statusCodes, setStatusCodes] = useState([]);
    const [locCodes,    setLocCodes]    = useState([]);
    const roleMap   = useMemo(()=>toMap(roleCodes),   [roleCodes]);
    const statusMap = useMemo(()=>toMap(statusCodes), [statusCodes]);
    const locMap    = useMemo(()=>toMap(locCodes),    [locCodes]);

    // ===== 목록/상세 =====
    const [list, setList]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    // ===== 상세/편집 =====
    const [detail, setDetail]   = useState(null);
    const [edit, setEdit]       = useState(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving]   = useState(false);

    // ===== 비밀번호 모달 =====
    const [pwOpen, setPwOpen]   = useState(false);
    const [pwForm, setPwForm]   = useState({ pw:'', pw2:'' });
    const [pwSaving, setPwSaving] = useState(false);

    // ===== 이미지 캐시버스팅 & 미리보기 =====
    const [imgVersion, setImgVersion] = useState(0);
    const { openPreview, PreviewPortal } = useImagePreview(imgVersion); // 최신 훅은 (fileId, name, url)도 허용

    // === 공통코드 로드 ===
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [r, s, w] = await Promise.all([
                    getCodes('ROLE'),
                    getCodes('ACCOUNT_STATUS'),
                    getCodes('WORK_LOCATION'),
                ]);
                if (!alive) return;
                setRoleCodes(sorted(r||[]));
                setStatusCodes(sorted(s||[]));
                setLocCodes(sorted(w||[]));
            } catch (e) {
                safeError('오류', '공통코드 조회 실패');
            }
        })();
        return ()=>{ alive=false; };
    }, []);

    // === 검색 디바운스 ===
    useEffect(() => {
        const t = setTimeout(() => setKwDebounced(keyword.trim()), 300);
        return () => clearTimeout(t);
    }, [keyword]);

    // === 목록 로드 ===
    const inflight = useRef(0);
    const loadList = useCallback(async (keepSelection=false) => {
        setLoading(true);
        const my = ++inflight.current;
        try {
            const res = await listStaffs({
                employeeType: empType,
                workLocation: workLoc || undefined,
                keyword: kwDebounced || undefined,
                page: 0, size: 30,
            });
            if (my !== inflight.current) return;
            const rows = res?.content || [];
            setList(rows);
            setSelectedId(prev => {
                if (keepSelection && prev && rows.some(r => r.id === prev)) return prev;
                return rows[0]?.id ?? null;
            });
        } catch (e) {
            setList([]);
            safeError('오류', e?.response?.data?.message || '직원 목록 조회 실패');
        } finally {
            if (my === inflight.current) setLoading(false);
        }
    }, [empType, workLoc, kwDebounced]);

    // === 필터 변경 시 목록 새로고침 ===
    useEffect(() => { loadList(false); }, [loadList]);

    // === 편집용 모델 변환 ===
    const toEdit = (d) => ({
        userName:     d?.userName ?? '',
        email:        d?.email ?? '',
        phoneNumber:  d?.phoneNumber ?? '',
        roleCode:     d?.roleCode ?? 'ROLE_STAFF',
        workLocation: d?.workLocation ?? (locCodes[0]?.code ?? ''),
        status:       d?.status ?? 'TEMPORARY',
        employeeType: d?.employeeType ?? 'STAFF',
    });

    // === 상세 로드 (선택/업로드 후) ===
    useEffect(() => {
        if (!selectedId) { setDetail(null); setEdit(null); setEditing(false); return; }
        let alive = true;
        (async () => {
            try {
                const d = await getStaff(selectedId);
                if (!alive) return;
                setDetail(d);
                setEdit(toEdit(d));
                setEditing(false);
            } catch (e) {
                setDetail(null); setEdit(null); setEditing(false);
            }
        })();
        return ()=>{ alive=false; };
    }, [selectedId, imgVersion]); // imgVersion 변경 시에도 상세 재로딩 → 새 이미지 반영

    // === 저장 ===
    const onSave = async () => {
        if (!selectedId || !edit) return;
        setSaving(true);
        try {
            await updateStaff(selectedId, {
                userName:     edit.userName,
                email:        edit.email,
                phoneNumber:  edit.phoneNumber,
                roleCode:     edit.roleCode,
                workLocation: edit.workLocation,
                status:       edit.status,
                employeeType: edit.employeeType,
            });
            const d = await getStaff(selectedId);
            setDetail(d);
            setEdit(toEdit(d));
            setEditing(false);
            await safeOk('성공', '저장되었습니다.');
            await loadList(true);
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '저장 실패');
        } finally { setSaving(false); }
    };

    // === 이미지 업로드 ===
    const onUploadPhoto = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await uploadStaffPhoto(selectedId, file); // 서버가 저장 및 DB photoPath/Url 갱신
            setImgVersion(v => v + 1);               // ✅ 캐시버스팅
            await loadList(true);                    // 좌측 목록 갱신
            const d = await getStaff(selectedId);    // 상세 동기화
            setDetail(d);
            setEdit(toEdit(d));
            await safeOk('성공', '사진이 변경되었습니다.');
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '이미지 업로드 실패');
        } finally { e.target.value=''; }
    };

    // 표시명 유틸
    const locName    = (code) => pickName(locMap, code);
    const roleName   = (code) => pickName(roleMap, code);
    const statusName = (code) => pickName(statusMap, code);
    function pickName(map, code){ return map[String(code||'').toUpperCase()]?.name || code || '-'; }

    return (
        <section className="p-6">
            <div className="aa-container-xxl">
                <h1 className="text-xl font-semibold text-white mb-4">직원 관리</h1>

                <div className="grid grid-cols-12 gap-4">
                    {/* 좌측 3/4 */}
                    <div className="col-span-12 md:col-span-4 lg:col-span-3">
                        <FilterPanel
                            empType={empType} setEmpType={setEmpType}
                            workLoc={workLoc} setWorkLoc={setWorkLoc}
                            keyword={keyword} setKeyword={setKeyword}
                            locCodes={locCodes}
                        />
                        <ListPanel
                            list={list}
                            loading={loading}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            locName={locName} roleName={roleName} statusName={statusName}
                            imgVersion={imgVersion}
                        />
                    </div>

                    {/* 우측 9/8 */}
                    <div className="col-span-12 md:col-span-8 lg:col-span-9">
                        <DetailPanel
                            detail={detail}
                            edit={edit}
                            setEdit={setEdit}
                            editing={editing}
                            setEditing={setEditing}
                            onSave={onSave}
                            saving={saving}
                            onUploadPhoto={onUploadPhoto}
                            openPw={()=>setPwOpen(true)}
                            locCodes={locCodes} roleCodes={roleCodes} statusCodes={statusCodes}
                            locName={locName} roleName={roleName} statusName={statusName}
                            imgVersion={imgVersion}
                            onPreviewImage={(row)=>{
                                // 프리뷰: 최신 훅은 (fileId, name, url) 인자를 허용
                                const url = withBust(buildPhotoSrc(row), imgVersion);
                                try {
                                    openPreview(row.profileImageId, row.userName, url);
                                } catch {
                                    // 구버전 훅 호환: fileId만 넘기고, 훅 내부에서 처리
                                    openPreview(row.profileImageId, row.userName);
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* 비밀번호 변경 모달 */}
            {pwOpen && (
                <Modal onClose={()=>setPwOpen(false)} title="비밀번호 변경">
                    <PasswordModal
                        pwForm={pwForm} setPwForm={setPwForm}
                        saving={pwSaving}
                        onSave={async ()=>{
                            const p1 = pwForm.pw?.trim() || '';
                            const p2 = pwForm.pw2?.trim() || '';
                            if (p1.length < 6) return safeInfo('안내', '비밀번호는 6자 이상이어야 합니다.');
                            if (p1 !== p2)    return safeInfo('안내', '비밀번호가 일치하지 않습니다.');
                            try {
                                setPwSaving(true);
                                await changeStaffPassword(selectedId, p1);
                                await loadList(true);
                                const d = await getStaff(selectedId);
                                setDetail(d); setEdit(toEdit(d));
                                setPwOpen(false);
                                await safeOk('성공', '비밀번호가 변경되었습니다.');
                            } catch (e) {
                                safeError('오류', e?.response?.data?.message || '비밀번호 변경 실패');
                            } finally { setPwSaving(false); }
                        }}
                        onCancel={()=>setPwOpen(false)}
                    />
                </Modal>
            )}

            {/* 이미지 프리뷰 포털 */}
            {PreviewPortal}
        </section>
    );
}

/* ---------------- 좌측: 필터 ---------------- */
function FilterPanel({ empType, setEmpType, workLoc, setWorkLoc, keyword, setKeyword, locCodes }) {
    return (
        <div className="aa-panel-dark p-4 mb-4 space-y-3">
            {/* 대상 */}
            <div className="flex items-center justify-between">
                <div className="text-sm text-slate-400">대상</div>
                <div className="flex gap-2">
                    {EMP_TYPES.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            className={`aa-chip ${empType===t.key ? 'aa-chip-on' : ''}`}
                            onClick={()=> setEmpType(t.key)}
                            title={t.label}
                        >{t.label}</button>
                    ))}
                </div>
            </div>

            {/* 소속 관 */}
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-400">소속 관</div>
                <select
                    className="aa-select min-w-[160px]"
                    value={workLoc}
                    onChange={(e)=> setWorkLoc(e.target.value)}
                    title="소속 관"
                >
                    <option value="">전체</option>
                    {sorted(locCodes).map(l => (
                        <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                    ))}
                </select>
            </div>

            {/* 검색 */}
            <div>
                <input
                    className="aa-input w-full"
                    placeholder="이름 / 아이디 / 이메일 검색"
                    value={keyword}
                    onChange={(e)=> setKeyword(e.target.value)}
                />
            </div>
        </div>
    );
}

/* ---------------- 좌측: 목록(이름순) ---------------- */
function ListPanel({ list, loading, selectedId, onSelect, locName, roleName, statusName, imgVersion }) {
    if (loading) return <div className="aa-panel-dark p-4">불러오는 중…</div>;
    if (!list?.length) return <div className="aa-panel-dark p-4">결과가 없습니다.</div>;

    const ordered = [...list].sort((a,b)=>
        (a.userName||'').localeCompare(b.userName||'', 'ko', { sensitivity:'base' })
    );

    return (
        <div className="aa-panel-dark divide-y staff-list-panel">
            {ordered.map(item => {
                const src = withBust(buildPhotoSrc(item), imgVersion); // ✅ 목록 썸네일도 /uploads URL 사용
                return (
                    <button
                        key={item.id}
                        type="button"
                        className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${selectedId===item.id ? 'bg-slate-800' : 'hover:bg-slate-800/60'}`}
                        onClick={() => onSelect(item.id)}
                        title={item.userName}
                    >
                        {/* Avatar가 src prop을 지원하면 사용, fileId는 구버전 호환용 */}
                        <Avatar fileId={item.profileImageId} src={src} name={item.userName} version={imgVersion}/>
                        <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                                {item.userName} <span className="text-slate-400">({locName(item.workLocation)})</span>
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                                {roleName(item.roleCode)} · {statusName(item.status)}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

/* ---------------- 우측: 상세 ---------------- */
function DetailPanel({
                         detail, edit, setEdit, editing, setEditing, onSave, saving, onUploadPhoto,
                         openPw, locCodes, roleCodes, statusCodes, locName, roleName, statusName, imgVersion, onPreviewImage
                     }) {
    if (!detail) return <div className="aa-panel-dark p-6">좌측에서 대상을 선택하세요.</div>;
    const set = (k)=>(e)=>setEdit(f=>({ ...f, [k]: e.target.value }));

    const photoSrc = withBust(buildPhotoSrc(detail), imgVersion); // ✅ 상세도 동일 규칙

    return (
        <div className="aa-panel-dark p-6 space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* 아바타: 클릭 시 확대 (편집 중이 아닐 때만) */}
                    {!editing ? (
                        <Avatar
                            size={80}
                            fileId={detail.profileImageId}  // 구버전 호환
                            src={photoSrc}                   // ✅ /uploads URL
                            name={detail.userName}
                            version={imgVersion}
                            onClick={() => onPreviewImage(detail)}
                            className="focus:outline-none focus:ring-2 focus:ring-slate-500 cursor-zoom-in"
                        />
                    ) : (
                        <Avatar size={80} fileId={detail.profileImageId} src={photoSrc} name={detail.userName} version={imgVersion}/>
                    )}
                    <div>
                        <div className="text-lg font-semibold">{detail.userName}</div>
                        <div className="text-sm text-slate-400">{detail.userId}</div>
                        {editing && (
                            <label className="inline-block mt-2">
                                <input type="file" className="hidden" onChange={onUploadPhoto}/>
                                <span className="px-3 py-1 rounded bg-slate-800 border cursor-pointer">사진 변경</span>
                            </label>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    {!editing ? (
                        <>
                            <button className="aa-btn" onClick={openPw}>비밀번호 변경</button>
                            <button className="aa-btn aa-btn-primary" onClick={()=>setEditing(true)}>수정</button>
                        </>
                    ) : (
                        <>
                            <button
                                className="aa-btn"
                                onClick={()=>{
                                    // 취소 시 원본으로 복원 (employeeType 포함)
                                    setEdit({
                                        userName:     detail.userName,
                                        email:        detail.email,
                                        phoneNumber:  detail.phoneNumber,
                                        roleCode:     detail.roleCode,
                                        workLocation: detail.workLocation,
                                        status:       detail.status,
                                        employeeType: detail.employeeType ?? 'STAFF',
                                    });
                                    setEditing(false);
                                }}
                            >취소</button>
                            <button className="aa-btn aa-btn-primary" disabled={saving} onClick={onSave}>
                                {saving?'저장 중…':'저장'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <Field label="이름">
                    {!editing ? <Readonly>{detail.userName}</Readonly>
                        : <input className="aa-input w-full" value={edit.userName} onChange={set('userName')} />}
                </Field>
                <Field label="이메일">
                    {!editing ? <Readonly>{detail.email || '-'}</Readonly>
                        : <input className="aa-input w-full" value={edit.email||''} onChange={set('email')} />}
                </Field>
                <Field label="연락처">
                    {!editing ? <Readonly>{detail.phoneNumber || '-'}</Readonly>
                        : <input className="aa-input w-full" value={edit.phoneNumber||''} onChange={set('phoneNumber')} />}
                </Field>
                <Field label="비상 연락처">
                    {!editing ? <Readonly>{detail.phoneNumber || '-'}</Readonly>
                        : <input className="aa-input w-full" value={edit.phoneNumber||''} onChange={set('phoneNumber')} />}
                </Field>
                <Field label="소속 관(workLocation)">
                    {!editing ? <Readonly>{locName(detail.workLocation)}</Readonly>
                        : (
                            <select className="aa-select w-full" value={edit.workLocation} onChange={set('workLocation')}>
                                {sorted(locCodes).map(l=>(
                                    <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                                ))}
                            </select>
                        )}
                </Field>
                {/* ✅ 구분(EmployeeType) */}
                <Field label="구분(EmployeeType)">
                    {!editing ? (
                        <Readonly>{detail.employeeType === 'TEACHER' ? '강사' : '직원'}</Readonly>
                    ) : (
                        <select
                            className="aa-select w-full"
                            value={edit.employeeType || 'STAFF'}
                            onChange={set('employeeType')}
                        >
                            <option value="STAFF">직원</option>
                            <option value="TEACHER">강사</option>
                        </select>
                    )}
                </Field>
                <Field label="상태(status)">
                    {!editing ? <Readonly>{statusName(detail.status)}</Readonly>
                        : (
                            <select className="aa-select w-full" value={edit.status} onChange={set('status')}>
                                {sorted(statusCodes).map(s=>(
                                    <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                                ))}
                            </select>
                        )}
                </Field>
                <Field label="권한(ROLE)">
                    {!editing ? <Readonly>{roleName(detail.roleCode)}</Readonly>
                        : (
                            <select className="aa-select w-full" value={edit.roleCode} onChange={set('roleCode')}>
                                {sorted(roleCodes).map(r=>(
                                    <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
                                ))}
                            </select>
                        )}
                </Field>
            </div>
        </div>
    );
}

/* ---------------- 공용 작은 컴포넌트 ---------------- */
function Field({ label, children }) {
    return <label className="block"><div className="text-sm mb-1 text-slate-300">{label}</div>{children}</label>;
}
function Readonly({ children }) {
    return <div className="px-3 py-2 rounded border border-slate-700 bg-slate-800 text-slate-100">{children ?? '-'}</div>;
}
function PasswordModal({ pwForm, setPwForm, saving, onSave, onCancel }) {
    const onPwChange = (k)=>(e)=>setPwForm(f=>({ ...f, [k]: e.target.value }));
    return (
        <div className="space-y-3">
            <div>
                <div className="text-sm mb-1">새 비밀번호</div>
                <input type="password" className="aa-input aa-input-contrast w-full"
                       placeholder="새 비밀번호" value={pwForm.pw} onChange={onPwChange('pw')} />
            </div>
            <div>
                <div className="text-sm mb-1">새 비밀번호 확인</div>
                <input type="password" className="aa-input aa-input-contrast w-full"
                       placeholder="새 비밀번호 확인" value={pwForm.pw2} onChange={onPwChange('pw2')} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <button className="aa-btn" onClick={onCancel} disabled={saving}>취소</button>
                <button className="aa-btn aa-btn-primary" onClick={onSave} disabled={saving}>
                    {saving ? '변경 중…' : '변경'}
                </button>
            </div>
        </div>
    );
}
