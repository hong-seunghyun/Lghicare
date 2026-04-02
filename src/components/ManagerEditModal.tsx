import React from "react";
import styled from "styled-components";
import { getBoardCategoryLabel } from "@/config/boardCategories";
import type { LearningActivityRow } from "@/lib/learning";

export type StatRow = {
  key: string;
  label: string;
  estimateCount: number;
  shareCount: number;
};

export type ManagerEditModalManager = {
  id?: string;
  managerId: string;
  name: string;
  position?: string;
  office?: string;
  teamLeaderId?: string;
  region?: string;
  estimateCount?: number;
  shareCount?: number;
};
export type ManagerEditModalProps = {
  manager: ManagerEditModalManager;
  form: {
    name: string;
    password: string;
    region: string;
    office: string;
    teamLeaderId: string;
  };
  onFormChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  saving: boolean;
  feedback?: string | null;
  feedbackError?: string | null;
  activityLoading: boolean;
  activityError?: string | null;
  activityTotals?: {
    estimateCount: number;
    shareCount: number;
  };
  categoryActivity: StatRow[];
  productActivity: StatRow[];
  regionListId?: string;
  officeListId?: string;
  teamLeaderListId?: string;
  learningTotals?: {
    views: number;
    shares: number;
  };
  learningLoading?: boolean;
  learningError?: string | null;
  learningDetails?: LearningActivityRow[];
};

export type { LearningActivityRow };

const LEARNING_ITEMS_PER_PAGE = 10;

const formatNumber = (value: number) =>
  new Intl.NumberFormat("ko-KR").format(value);

const ManagerEditModal: React.FC<ManagerEditModalProps> = ({
  manager,
  form,
  onFormChange,
  onSubmit,
  onClose,
  saving,
  feedback,
  feedbackError,
  activityLoading,
  activityError,
  activityTotals,
  categoryActivity,
  productActivity,
  learningTotals,
  learningLoading,
  learningError,
  learningDetails = [],
  regionListId,
  officeListId,
  teamLeaderListId,
}) => {
  const [learningPage, setLearningPage] = React.useState(1);

  React.useEffect(() => {
    setLearningPage(1);
  }, [learningDetails]);

  const sortedLearningDetails = React.useMemo(() => {
    return [...learningDetails].sort((a, b) => {
      if (b.viewCount !== a.viewCount) {
        return b.viewCount - a.viewCount;
      }
      if (b.shareCount !== a.shareCount) {
        return b.shareCount - a.shareCount;
      }
      return (b.postId ?? "").localeCompare(a.postId ?? "");
    });
  }, [learningDetails]);

  const totalLearningPages = Math.max(
    1,
    Math.ceil(sortedLearningDetails.length / LEARNING_ITEMS_PER_PAGE),
  );

  const learningPageDetails = React.useMemo(() => {
    const startIndex = (learningPage - 1) * LEARNING_ITEMS_PER_PAGE;
    return sortedLearningDetails.slice(
      startIndex,
      startIndex + LEARNING_ITEMS_PER_PAGE,
    );
  }, [learningPage, sortedLearningDetails]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalLearningPages) return;
    setLearningPage(newPage);
  };

  const heroEstimate =
    activityTotals?.estimateCount ?? manager.estimateCount ?? 0;
  const heroShare = activityTotals?.shareCount ?? manager.shareCount ?? 0;
  const heroTotal = heroEstimate + heroShare;
  const learningViews = learningTotals?.views ?? 0;
  const learningShares = learningTotals?.shares ?? 0;
  const showLearningCard =
    learningTotals !== undefined || learningLoading || Boolean(learningError);
  const hasLearningTotals =
    Boolean(learningTotals?.views) || Boolean(learningTotals?.shares);
  const showLearningSection =
    learningLoading ||
    Boolean(learningError) ||
    sortedLearningDetails.length > 0 ||
    hasLearningTotals;
  const showLearningPagination =
    sortedLearningDetails.length > LEARNING_ITEMS_PER_PAGE;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <ModalHeader>
          <ModalTitle>
            {manager.name} ({manager.managerId}) 편집
          </ModalTitle>
          <ModalCloseButton type="button" onClick={onClose}>
            ×
          </ModalCloseButton>
        </ModalHeader>
        <EditorInfo>
          <span>직급: {manager.position || "-"}</span>
          <span>사무소: {manager.office || "-"}</span>
          <span>담당 팀장: {manager.teamLeaderId || "-"}</span>
        </EditorInfo>

        <ActivityHero>
          <ActivityHeroCard>
            <ActivityHeroLabel>견적 활동</ActivityHeroLabel>
            <ActivityHeroValue>{formatNumber(heroEstimate)}</ActivityHeroValue>
          </ActivityHeroCard>
          <ActivityHeroCard>
            <ActivityHeroLabel>공유 활동</ActivityHeroLabel>
            <ActivityHeroValue>{formatNumber(heroShare)}</ActivityHeroValue>
          </ActivityHeroCard>
          <ActivityHeroCard>
            <ActivityHeroLabel>전체 활동</ActivityHeroLabel>
            <ActivityHeroValue>{formatNumber(heroTotal)}</ActivityHeroValue>
          </ActivityHeroCard>
          {showLearningCard && (
            <ActivityHeroCard>
              <ActivityHeroLabel>학습 활동</ActivityHeroLabel>
              <ActivityHeroValue>
                {formatNumber(learningViews + learningShares)}
              </ActivityHeroValue>
              <ActivitySubLabel>
                열람 {formatNumber(learningViews)} · 공유{" "}
                {formatNumber(learningShares)}
              </ActivitySubLabel>
            </ActivityHeroCard>
          )}
        </ActivityHero>

        {showLearningCard && learningLoading && (
          <InfoText>학습 활동을 불러오는 중입니다...</InfoText>
        )}
        {showLearningCard && learningError && (
          <ErrorText>{learningError}</ErrorText>
        )}

        {showLearningSection && (
          <LearningSection>
            <LearningHeader>
              <LearningTitle>학습 콘텐츠 목록</LearningTitle>
              <LearningSubtitle>
                열람/미열람 여부를 10개씩 확인하고 페이지 번호를 눌러
                이동해보세요.
              </LearningSubtitle>
            </LearningHeader>
            <LearningTableWrapper>
              <LearningTable>
                <thead>
                  <tr>
                    <th>카테고리</th>
                    <th>게시물</th>
                    <th>열람</th>
                    <th>공유</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {learningPageDetails.length === 0 ? (
                    <tr>
                      <td colSpan={5}>학습 내역이 없습니다.</td>
                    </tr>
                  ) : (
                    learningPageDetails.map((row) => {
                      const viewed = row.viewCount > 0;
                      return (
                        <tr
                          key={row.postId || `${row.categoryId}-${row.title}`}
                        >
                          <td>{getBoardCategoryLabel(row.categoryId)}</td>
                          <td>
                            <PostTitle title={row.title}>
                              {row.title || "-"}
                            </PostTitle>
                          </td>
                          <td>{row.viewCount}</td>
                          <td>{row.shareCount}</td>
                          <td>
                            <StatusChip $status={viewed ? "done" : "idle"}>
                              {viewed ? "열람" : "미열람"}
                            </StatusChip>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </LearningTable>
            </LearningTableWrapper>
            {showLearningPagination && (
              <LearningPagination>
                <PaginationButton
                  type="button"
                  onClick={() => handlePageChange(learningPage - 1)}
                  disabled={learningPage === 1}
                >
                  이전
                </PaginationButton>
                {Array.from({ length: totalLearningPages }).map((_, index) => (
                  <PaginationButton
                    key={`learning-page-${index + 1}`}
                    type="button"
                    $active={learningPage === index + 1}
                    onClick={() => handlePageChange(index + 1)}
                  >
                    {index + 1}
                  </PaginationButton>
                ))}
                <PaginationButton
                  type="button"
                  onClick={() => handlePageChange(learningPage + 1)}
                  disabled={learningPage === totalLearningPages}
                >
                  다음
                </PaginationButton>
                <PaginationSummary>
                  페이지 {learningPage} / {totalLearningPages}
                </PaginationSummary>
              </LearningPagination>
            )}
          </LearningSection>
        )}

        <Fields>
          <Field>
            <FieldLabel>이름</FieldLabel>
            <FieldInput name="name" value={form.name} onChange={onFormChange} />
          </Field>
          <Field>
            <FieldLabel>비밀번호</FieldLabel>
            <FieldInput
              name="password"
              type="password"
              value={form.password}
              onChange={onFormChange}
              placeholder="변경할 비밀번호를 입력하세요"
            />
          </Field>
        </Fields>

        <Divider />

        <Fields>
          <Field>
            <FieldLabel>지역</FieldLabel>
            <FieldInput
              name="region"
              value={form.region}
              onChange={onFormChange}
              placeholder="지역명을 입력하세요"
              list={regionListId ?? undefined}
            />
          </Field>
          <Field>
            <FieldLabel>사무소</FieldLabel>
            <FieldInput
              name="office"
              value={form.office}
              onChange={onFormChange}
              placeholder="사무소명을 입력하세요"
              list={officeListId ?? undefined}
            />
          </Field>
          <Field>
            <FieldLabel>담당 팀장</FieldLabel>
            <FieldInput
              name="teamLeaderId"
              value={form.teamLeaderId}
              onChange={onFormChange}
              placeholder="할당할 팀장 ID를 입력하세요"
              list={teamLeaderListId ?? undefined}
            />
          </Field>
        </Fields>

        <ButtonRow>
          <SaveButton type="submit" disabled={saving}>
            {saving ? "저장 중..." : "변경사항 저장"}
          </SaveButton>
          {feedback && <FeedbackSuccess>{feedback}</FeedbackSuccess>}
          {feedbackError && <FeedbackError>{feedbackError}</FeedbackError>}
        </ButtonRow>

        <ActivitySection>
          <ActivitySectionHeader>
            <ActivitySectionTitle>활동내역</ActivitySectionTitle>
            <ActivitySectionSubTitle>
              카테고리별, 제품별 활동 현황을 함께 확인할 수 있습니다.
            </ActivitySectionSubTitle>
          </ActivitySectionHeader>
          {activityLoading && (
            <InfoText>활동내역을 불러오는 중입니다...</InfoText>
          )}
          {activityError && <ErrorText>{activityError}</ErrorText>}
          {!activityLoading && !activityError && (
            <>
              <ActivityGrid>
                <ActivityCard>
                  <ActivityCardTitle>카테고리별 활동</ActivityCardTitle>
                  <ActivityTableWrapper>
                    <ActivityTable>
                      <thead>
                        <tr>
                          <th>카테고리</th>
                          <th>견적</th>
                          <th>공유</th>
                          <th>합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryActivity.length === 0 ? (
                          <tr>
                            <td colSpan={4}>활동내역이 없습니다.</td>
                          </tr>
                        ) : (
                          categoryActivity.slice(0, 8).map((row) => (
                            <tr key={`modal-category-${row.key}`}>
                              <td>{row.label}</td>
                              <td>{row.estimateCount}</td>
                              <td>{row.shareCount}</td>
                              <td>{row.estimateCount + row.shareCount}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </ActivityTable>
                  </ActivityTableWrapper>
                </ActivityCard>
                <ActivityCard>
                  <ActivityCardTitle>제품별 활동</ActivityCardTitle>
                  <ActivityTableWrapper>
                    <ActivityTable>
                      <thead>
                        <tr>
                          <th>제품</th>
                          <th>견적</th>
                          <th>공유</th>
                          <th>합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productActivity.length === 0 ? (
                          <tr>
                            <td colSpan={4}>활동내역이 없습니다.</td>
                          </tr>
                        ) : (
                          productActivity.slice(0, 8).map((row) => (
                            <tr key={`modal-product-${row.key}`}>
                              <td>
                                <ProductName title={row.label || row.key}>
                                  {row.label || row.key}
                                </ProductName>
                              </td>
                              <td>{row.estimateCount}</td>
                              <td>{row.shareCount}</td>
                              <td>{row.estimateCount + row.shareCount}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </ActivityTable>
                  </ActivityTableWrapper>
                </ActivityCard>
              </ActivityGrid>
              <ActivityNote>
                {"※ 표 상 합계는 제품 단위 집계이며, 실제 제출 건수는 "}
                {formatNumber(
                  activityTotals?.estimateCount ?? manager.estimateCount ?? 0,
                )}
                {"건입니다."}
              </ActivityNote>
            </>
          )}
        </ActivitySection>
      </ModalContent>
    </ModalOverlay>
  );
};

export default ManagerEditModal;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.form`
  width: min(720px, 100%);
  max-height: 90vh;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
`;

const ModalCloseButton = styled.button`
  background: transparent;
  border: none;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
`;

const EditorInfo = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: #555;
`;

const Fields = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldLabel = styled.label`
  font-size: 12px;
  color: #555;
`;

const FieldInput = styled.input`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #dcdcdc;
  font-size: 14px;
`;

const Divider = styled.div`
  height: 1px;
  background: #f0f0f0;
  margin: 6px 0 10px;
`;

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const SaveButton = styled.button`
  padding: 10px 18px;
  border-radius: 10px;
  border: none;
  background: #111;
  color: #fff;
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    background: #999;
    cursor: default;
  }
`;

const FeedbackSuccess = styled.div`
  font-size: 13px;
  color: #0b9150;
`;

const FeedbackError = styled.div`
  font-size: 13px;
  color: #e74c3c;
`;

const ActivityHero = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
`;

const ActivityHeroCard = styled.div`
  border-radius: 14px;
  padding: 14px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%);
  border: 1px solid #d9e7ff;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ActivityHeroLabel = styled.span`
  font-size: 12px;
  color: #52606d;
`;

const ActivityHeroValue = styled.strong`
  font-size: 24px;
  color: #1f2933;
`;

const ActivitySubLabel = styled.span`
  font-size: 11px;
  color: #52606d;
  margin-top: 4px;
`;

const LearningSection = styled.div`
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const LearningHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const LearningTitle = styled.h4`
  font-size: 14px;
  font-weight: 600;
  color: #1f2933;
`;

const LearningSubtitle = styled.span`
  font-size: 12px;
  color: #6b7280;
`;

const LearningTableWrapper = styled.div`
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow-x: auto;
`;

const LearningTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid #edf1f7;
  }

  th {
    font-weight: 600;
    color: #4b5563;
    background: #f1f5f9;
  }
`;

const LearningPagination = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
`;

const PaginationButton = styled.button<{ $active?: boolean }>`
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  font-size: 12px;
  background: ${({ $active }) => ($active ? "#111" : "#fff")};
  color: ${({ $active }) => ($active ? "#fff" : "#1f2933")};
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const PaginationSummary = styled.span`
  font-size: 12px;
  color: #6b7280;
`;

const PostTitle = styled.span`
  display: inline-block;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StatusChip = styled.span<{ $status: "done" | "idle" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: ${({ $status }) => ($status === "done" ? "#0b9150" : "#d97706")};
`;

const ActivitySection = styled.div`
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ActivityNote = styled.div`
  font-size: 12px;
  color: #64748b;
  padding-left: 4px;
`;

const ActivitySectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ActivitySectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1f2933;
`;

const ActivitySectionSubTitle = styled.p`
  font-size: 12px;
  color: #7b8794;
`;

const InfoText = styled.div`
  font-size: 14px;
  color: #555;
`;

const ErrorText = styled.div`
  font-size: 14px;
  color: #e74c3c;
`;

const ActivityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
`;

const ActivityCard = styled.div`
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  padding: 14px;
`;

const ActivityCardTitle = styled.h4`
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #1f2933;
`;

const ActivityTableWrapper = styled.div`
  max-height: 228px;
  overflow-y: auto;
  border-radius: 10px;
`;

const ActivityTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    padding: 8px 6px;
    border-bottom: 1px solid #e5e7eb;
    text-align: left;
  }

  th {
    color: #52606d;
    font-weight: 700;
    background: transparent;
  }
`;

const ProductName = styled.span`
  display: inline-block;
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;
