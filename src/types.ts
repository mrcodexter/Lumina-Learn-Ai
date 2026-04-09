export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: any;
}

export interface StudyNote {
  id?: string;
  userId: string;
  topic: string;
  content: string;
  language: string;
  createdAt: any;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface Quiz {
  id?: string;
  userId: string;
  topic: string;
  questions: QuizQuestion[];
  createdAt: any;
}
