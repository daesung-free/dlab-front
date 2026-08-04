import type { Mockup } from './types'
/* Phase 0 */
import { adminUserMockup } from './AdminUser'
/* Phase 1 */
import { studentSearchMockup } from './StudentSearch'
import { penaltyMockup } from './PenaltyManage'
import { enrollMockup } from './StudentEnroll'
import { classAssignMockup } from './ClassAssign'
import { absenceMockup } from './AbsenceRequest'
import { admissionMockup } from './AdmissionPipeline'
import { attendanceMockup } from './Attendance'
import { messageMockup } from './MessageSend'
import { basicSettingsMockup } from './BasicSettings'
import { profileFormMockup } from './ProfileForm'
/* Phase 2 */
import { mealMockup } from './MealManage'
import { lectureMockup } from './LectureManage'
import { paymentMockup } from './PaymentStatus'
import { affairsMockup } from './AffairsRoster'
import { adminAssignMockup } from './AdminAssign'
import { adminLectureMockup } from './AdminLecture'
import { adminBillingMockup } from './AdminBilling'
import { adminResultMockup } from './AdminResult'
import { seatMoveMockup } from './SeatMove'
/* Phase 3 */
import { scoreMockup } from './ScoreReport'
import { surveyMockup } from './SurveyManage'
import { dailyRoutineMockup } from './DailyRoutine'
import { learningPlanMockup } from './LearningPlan'
import { chatMockup } from './ChatManage'
import { consultMockup } from './ConsultLog'
import { approvalMockup } from './ApprovalRouting'
import { dailyReportMockup } from './DailyReport'
import { qnaMockup } from './QnaManage'
import { annualEventsMockup } from './AnnualEvents'
/* 클라이언트 메뉴표 기준 추가분 (F-C-n) */
import { changeLogMockup } from './ChangeLog'
import { studentStatusMockup } from './StudentStatus'
import { timetableMockup } from './Timetable'
import { readingRoomMockup } from './ReadingRoom'
import { paymentGateMockup } from './PaymentGate'
import { appManageMockup } from './AppManage'

/**
 * screenId(= data/menu.ts) → 화면 목업.
 * 요구사항정의서 1시트 30개 + 클라이언트 메뉴표 추가분 6개 = 36개 화면 전체를 덮는다.
 * 메뉴 배치(대분류/중분류)는 `data/nav.ts` 가 따로 정의한다.
 */
export const MOCKUPS: Record<string, Mockup> = {
  /* ── Phase 0 (선행 인프라) ── */
  'admin-user': adminUserMockup, // F-4.10-2 사용자 관리 (RBAC 5단계)

  /* ── Phase 1 (MVP) ── */
  'student-search': studentSearchMockup, // F-4.1-1 학원생 검색·조회
  'student-penalty': penaltyMockup, // F-4.1-2 상벌점 관리
  'student-enroll': enrollMockup, // F-4.1-3 신규 접수 등록
  'student-class': classAssignMockup, // F-4.1-4 반 배정(고정반)
  'student-absence': absenceMockup, // F-4.1-5 사유 신청 관리
  waitlist: admissionMockup, // F-4.2 대기자 관리 — 입학예약 파이프라인
  attendance: attendanceMockup, // F-4.3 출결 관리
  'message-send': messageMockup, // F-4.4 문자 → 카카오톡 발송
  'admin-basic': basicSettingsMockup, // F-4.10-1 기초 관리
  'profile-form': profileFormMockup, // F-4.11-9 신상기록부

  /* ── Phase 2 (핵심) ── */
  meal: mealMockup, // F-4.5 급식 관리
  lecture: lectureMockup, // F-4.7 특강 관리
  payment: paymentMockup, // F-4.8 수납현황
  affairs: affairsMockup, // F-4.9 교무업무 명단 조회·출력
  'admin-assign': adminAssignMockup, // F-4.10-3 배정 관리
  'admin-lecture': adminLectureMockup, // F-4.10-4 특강 기초 설정
  'admin-billing': adminBillingMockup, // F-4.10-5 수납 관리(청구기준)
  'admin-result': adminResultMockup, // F-4.10-6 실적 관리
  'seat-move': seatMoveMockup, // F-4.11-8 좌석 이탈/복귀

  /* ── Phase 3 (교육·성적·소통) ── */
  score: scoreMockup, // F-4.6 성적 관리
  survey: surveyMockup, // F-4.6-부속 설문 관리
  'daily-routine': dailyRoutineMockup, // F-4.11-1 데일리 루틴 관리
  'learning-plan': learningPlanMockup, // F-4.11-2 주·일 학습 계획 (FE 최대 공수)
  chat: chatMockup, // F-4.11-3 메시지 관리
  consult: consultMockup, // F-4.11-4 상담(일지·리포트)
  approval: approvalMockup, // F-4.11-5 승인 라우팅 관리
  'daily-report': dailyReportMockup, // F-4.11-6 Daily Report 집계
  qna: qnaMockup, // F-4.11-7 질의응답 관리 (대면 · 온라인)
  'annual-events': annualEventsMockup, // F-4.11-10 연간 행사 마스터

  /* ── 클라이언트 메뉴표 기준 추가분 ── */
  'change-log': changeLogMockup, // F-C-1 금일 수정 이력 (감사 로그)
  'student-status': studentStatusMockup, // F-C-2 학원생 현황 (집계)
  timetable: timetableMockup, // F-C-3 시간표 · 이동수업
  'reading-room': readingRoomMockup, // F-C-4 독서실 좌석배치표 ⭐
  'payment-gate': paymentGateMockup, // F-C-5 결제 관리
  'app-manage': appManageMockup, // F-C-6 앱 운영 관리
}

export type { Mockup }
