// src/features/member/pages/StaffAdminPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listStaffs, getStaff, updateStaff, changeStaffPassword, uploadStaffPhoto } from '@/features/member/api/staffApi.js';
import { alertError, alertInfo, alertSuccess } from '@/common/ui/alert.js';
import Modal from '@/common/components/ui/Modal.jsx';
import Avatar from '@/common/components/ui/Avatar.jsx';
import { useImagePreview } from '@/common/components/ui/ImagePreview.jsx';
import { uploadsUrl, withBust } from '@/common/utils/mediaUrl.js';
import AddressSearch from '@/common/components/AddressSearch.jsx';

// ✅ Context 사용
import { useCommonCodes } from '@/common/components/contexts/CommonCodeContext.jsx';

import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-shared.css';
import '@/features/member/styles/admin-staff.css';

const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

// 코드 배열 → Map 변환 유틸
const toMap  = (arr=[]) => Object.fromEntries(arr.map(x => [String(x.code).trim().toUpperCase(), x]));
const sorted = (arr=[]) => arr.slice().sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || String(a.name).localeCompare(b.name,'ko'));

function buildPhotoSrc(row){
    if (!row) return '';
    if (row.photoUrl)  return row.photoUrl;
    if (row.photoPath) return uploadsUrl(row.photoPath);
    return '';
}

export default function StaffAdminPage() {
    // ===== 필터 =====
    const [empType, setEmpType]   = useState('ALL');
    const [workLoc, setWorkLoc]   = useState('');
    const [keyword, setKeyword]   = useState('');
    const [kwDebounced, setKwDebounced] = useState('');

    // ===== 공통코드 Context 사용 =====
    // ✅ EMPLOYEE_TYPE 추가 로드
    const { codes: roleCodes,   codeLoading: roleLoading }   = useCommonCodes('ROLE');
    const { codes: statusCodes, codeLoading: statusLoading } = useCommonCodes('ACCOUNT_STATUS');
    const { codes: locCodes,    codeLoading: locLoading }    = useCommonCodes('WORK_LOCATION');
    const { codes: empTypeCodes,codeLoading: empLoading }    = useCommonCodes('EMPLOYEE_TYPE');

    // 코드 매핑용 Map 생성
    const roleMap   = useMemo(()=>toMap(roleCodes),   [roleCodes]);
    const statusMap = useMemo(()=>toMap(statusCodes), [statusCodes]);
    const locMap    = useMemo(()=>toMap(locCodes),    [locCodes]);
    const empMap    = useMemo(()=>toMap(empTypeCodes),[empTypeCodes]); // ✅

    // ===== 목록/상세 =====
    const [list, setList]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    // ===== 상세/수정 =====
    const [detail, setDetail]   = useState(null);
    const [edit, setEdit]       = useState(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving]   = useState(false);

    // ===== 비밀번호 변경 =====
    const [pwOpen, setPwOpen]   = useState(false);
    const [pwForm, setPwForm]   = useState({ pw:'', pw2:'' });
    const [pwSaving, setPwSaving] = useState(false);

    // ===== 이미지 프리뷰 =====
    const [imgVersion, setImgVersion] = useState(0);
    const { openPreview, PreviewPortal } = useImagePreview(imgVersion);

    // === 검색어 디바운스 ===
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
                employeeType: empType === 'ALL' ? undefined : empType,
                workLocation: workLoc || undefined,
                keyword: kwDebounced || undefined,
                page: 0, size: 30,
            });

            if (my !== inflight.current) return;

            const rows = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);
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

    useEffect(() => { loadList(false); }, [loadList]);

    // === 수정 폼 데이터 생성 ===
    const toEdit = useCallback((d) => ({
        userName:         d?.userName ?? '',
        email:            d?.email ?? '',
        birthdate:        d?.birthdate ?? '',
        phoneNumber:      d?.phoneNumber ?? '',
        emergencyContact: d?.emergencyContact ?? '',
        roleCode:         d?.roleCode ?? 'ROLE_STAFF',
        workLocation:     d?.workLocation ?? (locCodes[0]?.code ?? ''),
        status:           d?.status ?? 'TEMPORARY',
        // ✅ 공통코드 또는 기본값 사용
        employeeType:     d?.employeeType ?? (empTypeCodes[0]?.code ?? 'STAFF'),
        postalCode:       d?.postalCode ?? '',
        address:          d?.address ?? '',
        detailAddress:    d?.detailAddress ?? '',
    }), [locCodes, empTypeCodes]);

    // === 상세 조회 ===
    useEffect(() => {
        if (!selectedId) { setDetail(null); setEdit(null); setEditing(false); return; }
        let alive = true;
        (async () => {
            try {
                const d = await getStaff(selectedId);
                if (!alive) return;
                setDetail(d);
                // 모든 코드가 로딩 완료되어야 toEdit 기본값이 안전함
                if (!locLoading && !statusLoading && !empLoading) {
                    setEdit(toEdit(d));
                }
                setEditing(false);
            } catch (e) {
                setDetail(null); setEdit(null); setEditing(false);
            }
        })();
        return ()=>{ alive=false; };
    }, [selectedId, imgVersion, locLoading, statusLoading, empLoading, toEdit]);

    // === 저장 ===
    const onSave = async () => {
        if (!selectedId || !edit) return;
        setSaving(true);
        try {
            await updateStaff(selectedId, {
                userName:         edit.userName,
                email:            edit.email,
                birthdate:        edit.birthdate || null,
                phoneNumber:      edit.phoneNumber,
                emergencyContact: edit.emergencyContact,
                roleCode:         edit.roleCode,
                workLocation:     edit.workLocation,
                status:           edit.status,
                employeeType:     edit.employeeType,
                postalCode:       edit.postalCode,
                address:          edit.address,
                detailAddress:    edit.detailAddress,
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

    // === 사진 업로드 ===
    const onUploadPhoto = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await uploadStaffPhoto(selectedId, file);
            setImgVersion(v => v + 1);
            await loadList(true);
            const d = await getStaff(selectedId);
            setDetail(d);
            setEdit(toEdit(d));
            await safeOk('성공', '사진이 변경되었습니다.');
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '이미지 업로드 실패');
        } finally { e.target.value=''; }
    };

    // === 공통코드 이름 조회 헬퍼 ===
    const locName    = (code) => pickName(locMap, code);
    const roleName   = (code) => pickName(roleMap, code);
    const statusName = (code) => pickName(statusMap, code);
    const empTypeName= (code) => pickName(empMap, code); // ✅

    function pickName(map, code){ return map[String(code||'').toUpperCase()]?.name || code || '-'; }

    const set = (k)=>(e)=>setEdit(f=>({ ...f, [k]: e.target.value }));
    const onBirthChange = (e) => {
        const val = e.target.value;
        if (val && val.split('-')[0].length > 4) return;
        setEdit(f => ({ ...f, birthdate: val }));
    };

    return (
        <section className="aa-page staff-page">
            <div className="aa-container">
                <h1 className="aa-title" style={{marginTop:'0.5rem'}}>직원 관리</h1>

                <div className="grid grid-cols-12 gap-4" style={{marginTop:'0.5rem'}}>
                    {/* 3/4 */}
                    <div className="col-span-12 md:col-span-4 lg:col-span-3">
                        <FilterPanel
                            empType={empType} setEmpType={setEmpType}
                            workLoc={workLoc} setWorkLoc={setWorkLoc}
                            keyword={keyword} setKeyword={setKeyword}
                            locCodes={locCodes}
                            empTypeCodes={empTypeCodes} // ✅ 전달
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

                    {/* 9/8 */}
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
                            // ✅ 코드 목록 전달
                            locCodes={locCodes} roleCodes={roleCodes} statusCodes={statusCodes} empTypeCodes={empTypeCodes}
                            // ✅ 이름 변환 함수 전달
                            locName={locName} roleName={roleName} statusName={statusName} empTypeName={empTypeName}
                            imgVersion={imgVersion}
                            onPreviewImage={(row)=>{
                                const url = withBust(buildPhotoSrc(row), imgVersion);
                                try { openPreview(row.profileImageId, row.userName, url); }
                                catch { openPreview(row.profileImageId, row.userName); }
                            }}
                            onBirthChange={onBirthChange}
                        />
                    </div>
                </div>
            </div>

            {pwOpen && (
                <Modal onClose={()=>setPwOpen(false)} title="비밀번호 변경" size="sm">
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
            {PreviewPortal}
        </section>
    );
}

/* ---------------- 필터 패널 ---------------- */
function FilterPanel({ empType, setEmpType, workLoc, setWorkLoc, keyword, setKeyword, locCodes, empTypeCodes }) {
    return (
        <div className="aa-panel p-4 mb-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-sm text-slate-400">대상</div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        className={`aa-chip ${empType==='ALL' ? 'aa-chip-on active' : ''}`}
                        onClick={()=> setEmpType('ALL')}
                    >전체</button>
                    {/* ✅ 공통코드로 칩 생성 */}
                    {sorted(empTypeCodes).map(t => (
                        <button
                            key={t.code}
                            type="button"
                            className={`aa-chip ${empType===t.code ? 'aa-chip-on active' : ''}`}
                            onClick={()=> setEmpType(t.code)}
                            title={t.name}
                        >{t.name}</button>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-400 whitespace-nowrap min-w-[52px]">소속관</div>
                <select
                    className="aa-select min-w-[160px]"
                    value={workLoc}
                    onChange={(e)=> setWorkLoc(e.target.value)}
                    title="소속 관"
                >
                    <option value="">전체</option>
                    {sorted(locCodes).map(l => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                    ))}
                </select>
            </div>

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

/* ---------------- 목록 패널 ---------------- */
function ListPanel({ list, loading, selectedId, onSelect, locName, roleName, statusName, imgVersion }) {
    if (loading) return <div className="aa-panel p-4">불러오는 중…</div>;
    if (!list?.length) return <div className="aa-panel p-4">결과가 없습니다.</div>;

    const ordered = [...list].sort((a,b)=>
        (a.userName||'').localeCompare(b.userName||'', 'ko', { sensitivity:'base' })
    );

    return (
        <div className="aa-panel staff-list-panel divide-y">
            {ordered.map(item => {
                const selected = selectedId===item.id;
                const src = withBust(buildPhotoSrc(item), imgVersion);
                return (
                    <button
                        key={item.id}
                        type="button"
                        className={`w-full flex items-center gap-3 p-3 text-left transition-colors relative ${selected ? 'bg-slate-800 font-semibold' : 'hover:bg-slate-800/60'}`}
                        onClick={() => onSelect(item.id)}
                        aria-current={selected ? 'true' : 'false'}
                        title={item.userName}
                    >
                        {selected && (
                            <span aria-hidden="true" className="absolute left-0 top-0 h-full" style={{ width: 3, background: 'var(--aa-accent)' }} />
                        )}
                        <Avatar fileId={item.profileImageId} src={src} name={item.userName} version={imgVersion}/>
                        <div className="flex-1 min-w-0">
                            <div className="truncate">
                                {item.userName} <span className="text-slate-400 font-normal">({locName(item.workLocation)})</span>
                            </div>
                            <div className="text-xs text-slate-400 truncate font-normal">
                                {roleName(item.roleCode)} · {statusName(item.status)}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

/* ---------------- 상세 패널 ---------------- */
function DetailPanel({
                         detail, edit, setEdit, editing, setEditing, onSave, saving, onUploadPhoto,
                         openPw, locCodes, roleCodes, statusCodes, empTypeCodes, // ✅
                         locName, roleName, statusName, empTypeName, // ✅
                         imgVersion, onPreviewImage, onBirthChange
                     }) {
    if (!detail) return <div className="aa-panel p-6">좌측에서 대상을 선택하세요.</div>;
    const set = (k)=>(e)=>setEdit(f=>({ ...f, [k]: e.target.value }));
    const photoSrc = withBust(buildPhotoSrc(detail), imgVersion);

    const detailAddrRef = useRef(null);
    const onAddressComplete = ({ postalCode, address }) => {
        setEdit(f => ({ ...f, postalCode: postalCode || '', address: address || '' }));
        setTimeout(() => detailAddrRef.current?.focus(), 0);
    };
    const maskDetail = (s='') => (s.length <= 3 ? s : s.slice(0,3) + '***');

    return (
        <div className="aa-panel p-6 space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {!editing ? (
                        <Avatar
                            size={80}
                            fileId={detail.profileImageId}
                            src={photoSrc}
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
                                    setEdit({
                                        userName:         detail.userName,
                                        email:            detail.email,
                                        phoneNumber:      detail.phoneNumber,
                                        birthdate:        detail.birthdate ?? '',
                                        emergencyContact: detail.emergencyContact ?? '',
                                        roleCode:         detail.roleCode,
                                        workLocation:     detail.workLocation,
                                        status:           detail.status,
                                        employeeType:     detail.employeeType, // ✅
                                        postalCode:       detail.postalCode ?? '',
                                        address:          detail.address ?? '',
                                        detailAddress:    detail.detailAddress ?? '',
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

            {/* 정보 필드 그리드 */}
            <div className="grid md:grid-cols-2 gap-4">
                <Field label="이름">
                    {!editing ? <Readonly>{detail.userName}</Readonly>
                        : <input className="aa-input w-full" value={edit.userName} onChange={set('userName')} />}
                </Field>
                <Field label="이메일">
                    {!editing ? <Readonly>{detail.email || '-'}</Readonly>
                        : <input className="aa-input w-full" value={edit.email||''} onChange={set('email')} />}
                </Field>
                {/* 생년월일 */}
                <Field label="생년월일">
                    {!editing ? <Readonly>{detail.birthdate || '-'}</Readonly>
                        : (
                            <input
                                type="date"
                                className="aa-input w-full"
                                value={edit.birthdate}
                                onChange={onBirthChange}
                                max="9999-12-31"
                            />
                        )}
                </Field>
                <Field label="연락처">
                    {!editing ? <Readonly>{detail.phoneNumber || '-'}</Readonly>
                        : <input className="aa-input w-full" value={edit.phoneNumber||''} onChange={set('phoneNumber')} />}
                </Field>
                <Field label="비상 연락처">
                    {!editing ? <Readonly>{detail.emergencyContact || '-'}</Readonly>
                        : <input className="aa-input w-full" value={edit.emergencyContact||''} onChange={set('emergencyContact')} />}
                </Field>

                {/* ✅ 소속 관 */}
                <Field label="소속 관(workLocation)">
                    {!editing ? <Readonly>{locName(detail.workLocation)}</Readonly>
                        : (
                            <select className="aa-select w-full" value={edit.workLocation} onChange={set('workLocation')}>
                                {sorted(locCodes).map(l=>(
                                    <option key={l.code} value={l.code}>{l.name}</option>
                                ))}
                            </select>
                        )}
                </Field>

                {/* ✅ 구분: 공통코드 사용 */}
                <Field label="구분(EmployeeType)">
                    {!editing ? (
                        <Readonly>{empTypeName(detail.employeeType)}</Readonly>
                    ) : (
                        <select
                            className="aa-select w-full"
                            value={edit.employeeType}
                            onChange={set('employeeType')}
                        >
                            {sorted(empTypeCodes).map(t=>(
                                <option key={t.code} value={t.code}>{t.name}</option>
                            ))}
                        </select>
                    )}
                </Field>

                {/* ✅ 상태 */}
                <Field label="상태(status)">
                    {!editing ? <Readonly>{statusName(detail.status)}</Readonly>
                        : (
                            <select className="aa-select w-full" value={edit.status} onChange={set('status')}>
                                {sorted(statusCodes).map(s=>(
                                    <option key={s.code} value={s.code}>{s.name}</option>
                                ))}
                            </select>
                        )}
                </Field>

                {/* ✅ 권한 */}
                <Field label="권한(ROLE)">
                    {!editing ? <Readonly>{roleName(detail.roleCode)}</Readonly>
                        : (
                            <select className="aa-select w-full" value={edit.roleCode} onChange={set('roleCode')}>
                                {sorted(roleCodes).map(r=>(
                                    <option key={r.code} value={r.code}>{r.name}</option>
                                ))}
                            </select>
                        )}
                </Field>
            </div>

            {/* 주소 정보 */}
            <div className="border-t border-slate-700 pt-4 space-y-4">
                <div className="text-base font-semibold">주소</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="우편번호">
                        {!editing ? (
                            <Readonly>{detail.postalCode || '-'}</Readonly>
                        ) : (
                            <div className="flex gap-2">
                                <input
                                    className="aa-input w-full"
                                    value={edit.postalCode || ''}
                                    onChange={(e)=> setEdit(f=>({ ...f, postalCode: e.target.value.replace(/[^0-9]/g,'').slice(0,5) }))}
                                    placeholder="우편번호"
                                    inputMode="numeric"
                                    maxLength={5}
                                />
                                <AddressSearch
                                    onComplete={onAddressComplete}
                                    className="aa-btn aa-btn-primary whitespace-nowrap"
                                    buttonLabel="우편번호 검색"
                                />
                            </div>
                        )}
                    </Field>
                    <div className="hidden md:block" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="주소">
                        {!editing ? (
                            <Readonly>{detail.address || '-'}</Readonly>
                        ) : (
                            <input
                                className="aa-input w-full"
                                value={edit.address || ''}
                                onChange={(e)=> setEdit(f=>({ ...f, address: e.target.value }))}
                                placeholder="우편번호 찾기로 자동 입력"
                                readOnly
                            />
                        )}
                    </Field>
                    <Field label="상세주소">
                        {!editing ? (
                            <Readonly>{detail.detailAddress ? maskDetail(detail.detailAddress) : '-'}</Readonly>
                        ) : (
                            <input
                                ref={detailAddrRef}
                                className="aa-input w-full"
                                value={edit.detailAddress || ''}
                                onChange={(e)=> setEdit(f=>({ ...f, detailAddress: e.target.value }))}
                                placeholder="동/호수 등 상세 입력"
                                maxLength={100}
                            />
                        )}
                    </Field>
                </div>
            </div>
        </div>
    );
}

/* ---------------- 하위 컴포넌트 ---------------- */
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