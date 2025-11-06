// src/features/admin/pages/SchoolAdminPage.jsx
/**
 * Admin > 학교 관리 (개선판)
 * - 좌: 필터/목록, 우: 상세/편집
 * - ✅ 지역(admPrefix) 필터는 2/5/8/10 자리 ‘유의미 접두어’로 축약해서 전송
 * - ✅ 백엔드 파라미터 명 불일치 대비: admPrefix / admCodePrefix / admLike 동시 전송
 * - ✅ 상세 폼에서 RegionSelect로 admCode 선택/적용 가능
 * - ✅ 권한 체크: 비관리자에겐 신규/수정/삭제 버튼 숨김, 상세 조회 실패 시 요약으로 폴백
 * - ✅ 좌표/우편번호 입력 가드: lat/lng 7자리 정규화, 우편번호 5자리 숫자 제한
 *
 * ⚠️ CSS 임포트 규칙(중요):
 *   1) 다크 베이스/토큰: '@/styles/admin-system.css'
 *   2) 이 페이지 전용 스킨/레이아웃: '@/styles/admin-school.css'
 *   (라이트 전용 '@/styles/admin.css'는 사용하지 않음)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { listSchools, getSchool, createSchool, patchSchool, deleteSchool } from '@/api/schoolAdminApi';
import RegionSelect from '@/components/RegionSelect';
import AddressSearch from '@/components/AddressSearch';
import axios from '@/lib/axios';

// ✅ SweetAlert2 래퍼(공용 알림) — 기본 alert/confirm 대체
import { alertInfo, confirmDialog } from '@/ui/alert';

// ✅ CSS 임포트 — 순서 중요!
import '@/styles/admin-system.css';
import '@/styles/admin-school.css';

/* =========================
   ✅ 유틸: 법정동코드 유의미 접두어 계산 (2/5/8/10)
   ========================= */
function regionSignificantPrefix(code) {
    if (!code) return undefined;
    const c = String(code).trim();
    if (!/^\d{10}$/.test(c)) return undefined;
    const sgg = c.substring(2, 5);
    const umd = c.substring(5, 8);
    const ri  = c.substring(8, 10);

    if (sgg === '000' && umd === '000' && ri === '00') return c.substring(0, 2);  // 시/도
    if (umd === '000' && ri === '00')                 return c.substring(0, 5);    // 시·군·구
    if (ri === '00')                                  return c.substring(0, 8);    // 읍·면·동
    return c.substring(0, 10);                                                             // 리
}

// 가독성 라벨
const STAGES = [
    { value: '',  label: '전체'  },
    { value: 'E', label: '초등부' },
    { value: 'M', label: '중등부' },
    { value: 'H', label: '고등부' },
];
const STAGE_LABEL = { E: '초', M: '중', H: '고' };

export default function SchoolAdminPage() {
    // 필터/페이지
    const [filters, setFilters] = useState({ stage: '', active: '', keyword: '', region: null });
    const [page, setPage] = useState(0);
    const pageSize = 20;

    // 목록/선택/폼/상태
    const [rows, setRows] = useState({ content: [], totalElements: 0, totalPages: 0 });
    const [selectedId, setSelectedId] = useState(null);
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(false);

    // ✅ 상세 폼에서 지역 선택 후 admCode로 “적용”하기 위한 임시 상태
    const [regionPick, setRegionPick] = useState(null);

    // ✅ 관리자 권한 여부 (툴바 버튼 노출 제어)
    const [isAdmin, setIsAdmin] = useState(false);

    // ✅ 최초 진입 시 가벼운 관리자 권한 체크 (401/403이면 false)
    useEffect(() => {
        (async () => {
            try {
                await axios.get('/api/admin/schools', { params: { page: 0, size: 1 } });
                setIsAdmin(true);
            } catch {
                setIsAdmin(false);
            }
        })();
    }, []);

    // 목록 로딩
    const load = async (toPage = page) => {
        setLoading(true);
        try {
            // ✅ 유의미 접두어 계산
            const admPrefix = regionSignificantPrefix(filters.region?.code);
            // ✅ 파라미터 명 불일치 대비(서버는 모르는 파라미터는 무시)
            const params = {
                page: toPage, size: pageSize,
                stage:   filters.stage || undefined,
                active:  filters.active === '' ? undefined : (filters.active === 'true'),
                keyword: filters.keyword || undefined,
                admPrefix,
                admCodePrefix: admPrefix,
                admLike: admPrefix ? `${admPrefix}%` : undefined,
            };
            const data = await listSchools(params); // 공개 API 우선(403 회피)
            setRows(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.stage, filters.active, filters.keyword, filters.region?.code, page]);

    // ✅ 목록에서 해당 id의 요약 데이터를 찾아 읽기 전용 폼으로 만드는 폴백
    const fallbackFormFromSummary = (id) => {
        const it = (rows.content || []).find(r => r.id === id);
        if (!it) return null;
        return {
            id: it.id,
            name: it.name,
            stage: it.stage,
            active: it.active,
            postalCode: '', // SchoolSummary에 없을 수 있음
            address: it.address || '',
            detailAddress: it.detailAddress || '',
            admCode: '',            // SchoolSummary에는 없음 → 빈 값
            lat: null, lng: null,   // 요약 미포함
            homepageUrl: it.homepageUrl || '',
            phone: '',              // 요약 미포함
        };
    };

    // 행 선택 → 상세 로드 (보기모드)
    const onSelectRow = async (id) => {
        setSelectedId(id);
        setEditing(false);
        setRegionPick(null);
        try {
            const detail = await getSchool(id); // 관리자 전용: 비관리자면 401/403 가능
            setForm(detail);
        } catch {
            // ✅ 권한 없음 등 오류 시 요약 데이터로 폴백하여 읽기 전용 표시
            const fb = fallbackFormFromSummary(id);
            setForm(fb);
        }
    };

    // 신규 → 편집모드 (관리자만)
    const onNew = () => {
        if (!isAdmin) {
            // ❌ window.alert → ✅ SweetAlert2 래퍼
            alertInfo('권한 필요', '관리자 권한이 필요합니다.');
            return;
        }
        setSelectedId(null);
        setForm({
            name: '', stage: 'E', active: true,
            postalCode: '', address: '', detailAddress: '',
            admCode: '', lat: null, lng: null, homepageUrl: '', phone: '',
        });
        setEditing(true);
        setRegionPick(null);
    };

    // 보기→편집 (관리자만)
    const onEdit = () => {
        if (!form) return;
        if (!isAdmin) {
            // ❌ window.alert → ✅ SweetAlert2 래퍼
            alertInfo('권한 필요', '관리자 권한이 필요합니다.');
            return;
        }
        setEditing(true);
    };

    // 취소
    const onCancel = () => {
        setEditing(false);
        setRegionPick(null);
        if (selectedId) {
            getSchool(selectedId).then(setForm).catch(() => {
                setForm(fallbackFormFromSummary(selectedId));
            });
        } else {
            setForm(null);
        }
    };

    // 저장 (신규/수정) — 관리자만
    const onSave = async () => {
        if (!form) return;
        if (!isAdmin) {
            // ❌ window.alert → ✅ SweetAlert2 래퍼
            await alertInfo('권한 필요', '관리자 권한이 필요합니다.');
            return;
        }

        // ✅ 좌표는 숫자 또는 null, 우편번호는 5자리 숫자만
        const zip = (form.postalCode || '').replace(/[^\d]/g, '').slice(0, 5) || null;

        const payload = {
            name: form.name,
            stage: form.stage,
            eduOfficeCode: form.eduOfficeCode || null,
            phone: form.phone || null,
            postalCode: zip,
            address: form.address || null,             // 도로명
            detailAddress: form.detailAddress || null, // 지번(옛 주소)
            admCode: form.admCode || null,
            lat: (form.lat === '' || form.lat == null) ? null : Number(form.lat),
            lng: (form.lng === '' || form.lng == null) ? null : Number(form.lng),
            homepageUrl: form.homepageUrl || null,
            active: !!form.active,
        };

        if (selectedId) {
            await patchSchool(selectedId, payload);
            await load();
            try {
                const d = await getSchool(selectedId);
                setForm(d);
            } catch {
                setForm(fallbackFormFromSummary(selectedId));
            }
        } else {
            const newId = await createSchool(payload);
            setSelectedId(newId);
            await load(0);
            try {
                const d = await getSchool(newId);
                setForm(d);
            } catch {
                setForm(fallbackFormFromSummary(newId));
            }
        }
        setEditing(false);
    };

    // 삭제 — 관리자만
    const onDelete = async () => {
        if (!selectedId) return;
        if (!isAdmin) {
            // ❌ window.alert → ✅ SweetAlert2 래퍼
            await alertInfo('권한 필요', '관리자 권한이 필요합니다.');
            return;
        }
        // ❌ window.confirm → ✅ confirmDialog
        const ok = await confirmDialog('삭제 확인', '정말 삭제하시겠습니까?');
        if (!ok) return;

        await deleteSchool(selectedId);
        setSelectedId(null);
        setForm(null);
        setEditing(false);
        await load();
    };

    // ✅ RegionSelect에서 가장 깊이 선택된 코드 뽑기 (depth4→3→2→1)
    const pickedRegionCode = useMemo(() => {
        const v = regionPick || {};
        return v?.depth4?.code || v?.depth3?.code || v?.depth2?.code || v?.depth1?.code || '';
    }, [regionPick]);

    // 숫자 7자리 고정 표시용(blur에서만 사용하고 저장은 Number 처리)
    const fmt7 = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return '';
        return n.toFixed(7);
    };

    return (
        <div className="aa-container-xl aa-page school-page">
            {/* 툴바 */}
            <div className="aa-toolbar">
                <div className="aa-title">학교 관리</div>
                <div className="aa-subtle">
                    학부/지역/키워드로 검색 후 우측에서 상세/편집
                    {!isAdmin && ' · (읽기 전용) 관리자 기능은 숨겨집니다.'}
                </div>
                <div className="aa-toolbar-right">
                    {isAdmin ? (
                        !editing ? (
                            <>
                                <button className="aa-btn" onClick={onNew}>신규</button>
                                <button className="aa-btn aa-btn-primary" onClick={onEdit} disabled={!form}>수정</button>
                                <button className="aa-btn aa-btn-danger" onClick={onDelete} disabled={!selectedId}>삭제</button>
                            </>
                        ) : (
                            <>
                                <button className="aa-btn" onClick={onCancel}>취소</button>
                                <button className="aa-btn aa-btn-primary" onClick={onSave}>저장</button>
                            </>
                        )
                    ) : null}
                </div>
            </div>

            {/* 좌:4 / 우:6 분할 — 이 유틸은 admin-school.css가 제공 */}
            <div className="aa-split aa-split-4-6">
                {/* 좌측: 필터 + 목록 */}
                <div className="aa-panel aa-panel--card aa-sticky-lg aa-left-4">
                    <div className="school-filters">
                        {/* 학부 */}
                        <div className="aa-field">
                            <label className="aa-label">학부</label>
                            <select
                                className="aa-select"
                                value={filters.stage}
                                onChange={(e)=> { setFilters(p => ({ ...p, stage: e.target.value })); setPage(0); }}>
                                {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>

                        {/* 활성 */}
                        <div className="aa-field">
                            <label className="aa-label">활성</label>
                            <select
                                className="aa-select"
                                value={filters.active}
                                onChange={(e)=> { setFilters(p => ({ ...p, active: e.target.value })); setPage(0); }}>
                                <option value="">전체</option>
                                <option value="true">활성</option>
                                <option value="false">비활성</option>
                            </select>
                        </div>

                        {/* 지역 */}
                        <div className="aa-field field-region">
                            <label className="aa-label">지역</label>
                            <RegionSelect
                                value={filters.region}
                                onChange={(v)=> { setFilters(p=> ({ ...p, region: v })); setPage(0); }}
                                className="w-full"
                                selectClassName="aa-select"
                                showReset
                            />
                        </div>

                        {/* 학교명 + 검색/초기화 */}
                        <div className="aa-field field-name-row">
                            <label className="aa-label">학교명</label>
                            <div className="aa-row">
                                <input
                                    className="aa-input"
                                    placeholder="학교명 키워드"
                                    value={filters.keyword}
                                    onChange={(e)=> setFilters(p => ({ ...p, keyword: e.target.value }))}
                                />
                                <button className="aa-btn aa-btn-primary" onClick={()=> setPage(0)}>검색</button>
                                <button
                                    className="aa-btn"
                                    onClick={() => { setFilters({ stage:'', active:'', keyword:'', region:null }); setPage(0); }}>
                                    초기화
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 목록 */}
                    <div className="school-list aa-panel-scroll">
                        {loading && rows.content.length === 0 && (
                            <div className="school-empty">목록을 불러오는 중…</div>
                        )}
                        {!loading && rows.content.length === 0 && (
                            <div className="school-empty">검색 결과가 없습니다.</div>
                        )}
                        {rows.content.map(row => (
                            <button
                                key={row.id}
                                type="button"
                                className={'school-item' + (selectedId === row.id ? ' on' : '')}
                                onClick={() => onSelectRow(row.id)}
                                title={row.name}
                            >
                                <div className="school-item-top">
                                    <strong className="school-name">{row.name}</strong>
                                    <span className="aa-badge">{STAGE_LABEL[row.stage] ?? row.stage}</span>
                                </div>
                                <div className="school-addr aa-ellipsis">
                                    {(row.address || '') + (row.detailAddress ? (' ' + row.detailAddress) : '')}
                                </div>
                                <div className="school-meta">
                                    <span className="aa-badge aa-badge--muted">{row.homepageUrl ? '홈페이지 있음' : '홈페이지 없음'}</span>
                                    <span className={'aa-badge ' + (row.active ? 'aa-badge--ok' : 'aa-badge--warn')}>
                                        {row.active ? '활성' : '비활성'}
                                    </span>
                                </div>
                            </button>
                        ))}

                        {/* 페이지네이션 */}
                        <div className="school-pager">
                            <span className="count">총 {rows.totalElements}건</span>
                            <div className="aa-row">
                                <button className="aa-btn" disabled={page<=0} onClick={()=> setPage(p => p - 1)}>이전</button>
                                <div className="aa-subtle">{page+1} / {rows.totalPages || 1}</div>
                                <button className="aa-btn" disabled={page+1 >= (rows.totalPages||1)} onClick={()=> setPage(p => p + 1)}>다음</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 우측: 상세/편집 */}
                <div className="aa-panel aa-panel--card aa-right-6">
                    {!form ? (
                        <div className="school-empty">좌측 목록에서 학교를 선택하거나 {isAdmin && '[신규]'}를 눌러 등록을 시작하세요.</div>
                    ) : (
                        <div className="aa-form-grid-2">
                            {/* 기본 */}
                            <div className="aa-field" style={{ gridColumn: '1 / -1' }}>
                                <label className="aa-label">학교명</label>
                                <input
                                    className="aa-input"
                                    value={form.name || ''}
                                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                    disabled={!editing}
                                />
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">학부</label>
                                <select
                                    className="aa-select"
                                    value={form.stage || 'E'}
                                    onChange={e => setForm(p => ({ ...p, stage: e.target.value }))}
                                    disabled={!editing}
                                >
                                    {STAGES.filter(s => s.value).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">활성</label>
                                <div className="aa-row">
                                    <input
                                        type="checkbox"
                                        checked={!!form.active}
                                        onChange={e => setForm(p => ({ ...p, active: e.target.checked }))}
                                        disabled={!editing}
                                    />
                                    <span className="aa-subtle">{form.active ? '활성' : '비활성'}</span>
                                </div>
                            </div>

                            {/* 주소 */}
                            <div className="aa-field" style={{ gridColumn: '1 / -1' }}>
                                <label className="aa-label">주소(우편번호 검색)</label>
                                <div className="aa-row">
                                    <AddressSearch
                                        buttonLabel="우편번호 찾기"
                                        onComplete={({ postalCode, address }) => {
                                            if (!editing) return;
                                            const zip = (postalCode || '').replace(/[^\d]/g, '').slice(0, 5);
                                            setForm(p => ({ ...p, postalCode: zip || null, address: address || null }));
                                        }}
                                        className="aa-btn aa-btn-primary"
                                        disabled={!editing}
                                    />
                                    <input
                                        className="aa-input"
                                        placeholder="우편번호"
                                        style={{ maxWidth: 140 }}
                                        value={form.postalCode || ''}
                                        onChange={e => {
                                            const zip = (e.target.value || '').replace(/[^\d]/g, '').slice(0, 5);
                                            setForm(p => ({ ...p, postalCode: zip }));
                                        }}
                                        disabled={!editing}
                                    />
                                    <input
                                        className="aa-input"
                                        placeholder="도로명 주소(자동 세팅)"
                                        value={form.address || ''}
                                        onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                                        disabled
                                    />
                                </div>
                            </div>

                            <div className="aa-field" style={{ gridColumn: '1 / -1' }}>
                                <label className="aa-label">상세주소(지번/비고)</label>
                                <input
                                    className="aa-input"
                                    value={form.detailAddress || ''}
                                    onChange={e => setForm(p => ({ ...p, detailAddress: e.target.value }))}
                                    disabled={!editing}
                                />
                            </div>

                            {/* ✅ 법정동/좌표: RegionSelect로 코드 선택 → 적용 */}
                            <div className="aa-field" style={{ gridColumn: '1 / -1' }}>
                                <label className="aa-label">법정동코드 (admCode)</label>
                                <div className="aa-row">
                                    <input
                                        className="aa-input"
                                        placeholder="10자리 법정동코드"
                                        value={form.admCode || ''}
                                        onChange={e => setForm(p => ({ ...p, admCode: e.target.value.replace(/[^\d]/g, '').slice(0, 10) }))}
                                        disabled={!editing}
                                        style={{ maxWidth: 220 }}
                                    />
                                    <span className="aa-subtle">또는 지역 선택 → 적용</span>
                                </div>
                                {editing && (
                                    <div className="aa-row" style={{ marginTop: 8 }}>
                                        <RegionSelect
                                            value={regionPick}
                                            onChange={setRegionPick}
                                            className="w-full"
                                            selectClassName="aa-select"
                                            showReset
                                        />
                                        <button
                                            type="button"
                                            className="aa-btn"
                                            onClick={() => setForm(p => ({ ...p, admCode: pickedRegionCode }))}
                                            disabled={!pickedRegionCode}
                                            title="선택한 지역코드를 admCode에 적용"
                                        >
                                            적용
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">위도 (lat)</label>
                                <input
                                    className="aa-input"
                                    type="number" step="0.0000001"
                                    value={form.lat ?? ''}
                                    onChange={e => setForm(p => ({ ...p, lat: e.target.value ? Number(e.target.value) : null }))}
                                    onBlur={e => {
                                        const v = e.target.value;
                                        if (v !== '' && Number.isFinite(Number(v))) {
                                            setForm(p => ({ ...p, lat: Number(fmt7(v)) }));
                                        }
                                    }}
                                    disabled={!editing}
                                />
                            </div>
                            <div className="aa-field">
                                <label className="aa-label">경도 (lng)</label>
                                <input
                                    className="aa-input"
                                    type="number" step="0.0000001"
                                    value={form.lng ?? ''}
                                    onChange={e => setForm(p => ({ ...p, lng: e.target.value ? Number(e.target.value) : null }))}
                                    onBlur={e => {
                                        const v = e.target.value;
                                        if (v !== '' && Number.isFinite(Number(v))) {
                                            setForm(p => ({ ...p, lng: Number(fmt7(v)) }));
                                        }
                                    }}
                                    disabled={!editing}
                                />
                            </div>

                            {/* 연락/홈페이지 */}
                            <div className="aa-field">
                                <label className="aa-label">연락처</label>
                                <input
                                    className="aa-input"
                                    value={form.phone || ''}
                                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                                    disabled={!editing}
                                />
                            </div>
                            <div className="aa-field" style={{ gridColumn: '1 / -1' }}>
                                <label className="aa-label">홈페이지 URL</label>
                                <input
                                    className="aa-input"
                                    value={form.homepageUrl || ''}
                                    onChange={e => setForm(p => ({ ...p, homepageUrl: e.target.value }))}
                                    disabled={!editing}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}