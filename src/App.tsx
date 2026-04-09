import { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  Timestamp,
  User,
  OperationType,
  handleFirestoreError
} from './firebase';
import { generateStudyNotes, generateQuiz } from './services/geminiService';
import { UserProfile, StudyNote, Quiz, QuizQuestion } from './types';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ScrollArea } from './components/ui/scroll-area';
import { Skeleton } from './components/ui/skeleton';
import { BookOpen, BrainCircuit, History, LogOut, Search, Sparkles, User as UserIcon, CheckCircle2, XCircle, Trash2, AlertTriangle, Pencil, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('English');
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('generate');
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'note' | 'quiz' } | null>(null);
  const [editingNote, setEditingNote] = useState<StudyNote | null>(null);
  const [viewingNote, setViewingNote] = useState<StudyNote | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Ensure user profile exists
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            createdAt: Timestamp.now()
          });
        }
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const notesQuery = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyNote)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notes'));

    const quizzesQuery = query(
      collection(db, 'quizzes'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeQuizzes = onSnapshot(quizzesQuery, (snapshot) => {
      setQuizzes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'quizzes'));

    return () => {
      unsubscribeNotes();
      unsubscribeQuizzes();
    };
  }, [user]);

  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError('The login window was closed before completion. Please try again.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        setLoginError('Login request was cancelled. Please try again.');
      } else {
        setLoginError('An error occurred during login. Please check your connection and try again.');
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setGenerationError('Please enter a topic first.');
      return;
    }
    if (topic.trim().length < 3) {
      setGenerationError('Topic is too short. Please be more specific.');
      return;
    }

    setGenerationError(null);
    setIsGenerating(true);
    
    try {
      // Generate both notes and quiz
      // We use Promise.all to run them in parallel for better performance
      const [content, questions] = await Promise.all([
        generateStudyNotes(topic, language),
        generateQuiz(topic, language)
      ]);

      if (!content || !questions) {
        throw new Error('Failed to generate content. Please try a different topic.');
      }

      // Save Notes to Firestore
      await addDoc(collection(db, 'notes'), {
        userId: user.uid,
        topic: topic.trim(),
        content,
        language,
        createdAt: Timestamp.now()
      });
      
      // Save Quiz to Firestore
      await addDoc(collection(db, 'quizzes'), {
        userId: user.uid,
        topic: topic.trim(),
        questions,
        createdAt: Timestamp.now()
      });

      setTopic('');
      setActiveTab('notes');
    } catch (error: any) {
      console.error('Generation error:', error);
      setGenerationError(error.message || 'An unexpected error occurred during generation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const startQuiz = (quiz: Quiz) => {
    setCurrentQuiz(quiz);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setActiveTab('quiz-active');
  };

  const submitQuiz = () => {
    setQuizSubmitted(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      const collectionName = itemToDelete.type === 'note' ? 'notes' : 'quizzes';
      await deleteDoc(doc(db, collectionName, itemToDelete.id));
      setItemToDelete(null);
    } catch (error: any) {
      console.error('Delete error:', error);
      alert('Failed to delete item. Please try again.');
    }
  };

  const handleUpdateNote = async () => {
    if (!editingNote || !editingNote.id) return;
    
    try {
      const noteRef = doc(db, 'notes', editingNote.id);
      await updateDoc(noteRef, {
        topic: editingNote.topic,
        language: editingNote.language,
        content: editingNote.content
      });
      setEditingNote(null);
    } catch (error: any) {
      console.error('Update error:', error);
      alert('Failed to update note. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="space-y-4 w-full max-w-md p-8">
          <Skeleton className="h-12 w-3/4 mx-auto" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8 max-w-2xl"
        >
          <div className="space-y-4">
            <div className="inline-flex p-4 bg-indigo-600 rounded-2xl text-white mb-4">
              <Sparkles size={48} />
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Lumina Learn</h1>
            <p className="text-xl text-slate-600 dark:text-slate-400">
              Your AI-powered study companion. Generate notes, take quizzes, and master any topic in seconds.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {[
              { icon: BookOpen, title: "Smart Notes", desc: "Instant comprehensive study materials." },
              { icon: BrainCircuit, title: "AI Quizzes", desc: "Test your knowledge with custom quizzes." },
              { icon: History, title: "Track Progress", desc: "Save and revisit your learning history." }
            ].map((feature, i) => (
              <Card key={`feature-${i}`} className="border-none shadow-sm bg-white dark:bg-slate-900">
                <CardHeader className="pb-2">
                  <feature.icon className="text-indigo-600 dark:text-indigo-400 mb-2" size={24} />
                  <CardTitle className="text-lg dark:text-slate-100">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button onClick={handleLogin} size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg transition-all hover:scale-105">
            Get Started with Google
          </Button>

          {loginError && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm font-medium mt-4"
            >
              {loginError}
            </motion.p>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
              <Sparkles size={20} />
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-50">Lumina Learn</span>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </Button>

            <div className="hidden sm:flex items-center gap-2 text-slate-600 dark:text-slate-400 mr-4">
              <UserIcon size={18} />
              <span className="text-sm font-medium">{user.displayName}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400">
              <LogOut size={18} className="mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1">
              <TabsTrigger value="generate" className="data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-900/30 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">
                <Search size={16} className="mr-2" />
                Generate
              </TabsTrigger>
              <TabsTrigger value="notes" className="data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-900/30 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">
                <BookOpen size={16} className="mr-2" />
                My Notes
              </TabsTrigger>
              <TabsTrigger value="quizzes" className="data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-900/30 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">
                <BrainCircuit size={16} className="mr-2" />
                My Quizzes
              </TabsTrigger>
            </TabsList>

            {activeTab === 'generate' && (
              <div className="flex gap-2 w-full sm:w-auto">
                <select 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                >
                  <option value="English">English</option>
                  <option value="Bangla">Bangla</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                </select>
              </div>
            )}
          </div>

          <AnimatePresence mode="wait">
            <TabsContent key="tab-generate" value="generate" className="mt-0">
              <motion.div 
                key="motion-generate"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto text-center space-y-8 py-12"
              >
                <div className="space-y-4">
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">What do you want to learn today?</h2>
                  <p className="text-slate-500 dark:text-slate-400">Enter any topic and we'll generate custom study notes and a quiz for you.</p>
                </div>

                <div className="relative group">
                  <Input 
                    placeholder="e.g., Photosynthesis, Quantum Physics, History of Bangladesh..." 
                    value={topic}
                    onChange={(e) => {
                      setTopic(e.target.value);
                      if (generationError) setGenerationError(null);
                    }}
                    className={`h-16 pl-6 pr-32 text-lg rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm focus:ring-indigo-500 group-hover:border-indigo-300 dark:group-hover:border-indigo-700 transition-all dark:text-slate-100 ${generationError ? 'border-red-300 ring-red-100' : ''}`}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  />
                  <Button 
                    onClick={handleGenerate} 
                    disabled={!topic.trim() || isGenerating}
                    className="absolute right-2 top-2 h-12 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all"
                  >
                    {isGenerating ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Sparkles size={18} />
                        Generate
                      </div>
                    )}
                  </Button>
                </div>

                {generationError && (
                  <motion.p 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-500 text-sm font-medium"
                  >
                    {generationError}
                  </motion.p>
                )}

                <div className="flex flex-wrap justify-center gap-2">
                  {['Global Warming', 'Artificial Intelligence', 'Ancient Rome', 'Human Anatomy'].map((t, idx) => (
                    <button 
                      key={`suggestion-${idx}`}
                      onClick={() => setTopic(t)}
                      className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-sm text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </motion.div>
            </TabsContent>

            <TabsContent key="tab-notes" value="notes" className="mt-0">
              <motion.div
                key="motion-notes"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {notes.length === 0 ? (
                  <div className="col-span-full py-20 text-center space-y-4">
                    <div className="bg-slate-100 dark:bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-400 dark:text-slate-600">
                      <BookOpen size={32} />
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">No notes generated yet. Start by searching for a topic!</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <Card key={`note-${note.id}`} className="group hover:shadow-md transition-all border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col bg-white dark:bg-slate-900">
                      <CardHeader className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle className="text-lg line-clamp-1 dark:text-slate-100">{note.topic}</CardTitle>
                            <CardDescription className="dark:text-slate-400">{new Date(note.createdAt.toDate()).toLocaleDateString()}</CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded">
                              {note.language}
                            </span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                              onClick={() => setEditingNote(note)}
                            >
                              <Pencil size={16} />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                              onClick={() => setItemToDelete({ id: note.id!, type: 'note' })}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 py-4">
                        <ScrollArea className="h-48">
                          <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                            <ReactMarkdown>{note.content.substring(0, 500) + '...'}</ReactMarkdown>
                          </div>
                        </ScrollArea>
                      </CardContent>
                      <CardFooter className="border-t border-slate-100 dark:border-slate-800 pt-4">
                        <Button 
                          variant="outline" 
                          onClick={() => setViewingNote(note)}
                          className="w-full group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:border-indigo-200 dark:group-hover:border-indigo-800 dark:border-slate-800 dark:text-slate-300"
                        >
                          Read Full Note
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                )}
              </motion.div>
            </TabsContent>

            <TabsContent key="tab-quizzes" value="quizzes" className="mt-0">
              <motion.div
                key="motion-quizzes"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {quizzes.length === 0 ? (
                  <div className="col-span-full py-20 text-center space-y-4">
                    <div className="bg-slate-100 dark:bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-400 dark:text-slate-600">
                      <BrainCircuit size={32} />
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">No quizzes generated yet. Start by searching for a topic!</p>
                  </div>
                ) : (
                  quizzes.map((quiz) => (
                    <Card key={`quiz-${quiz.id}`} className="group hover:shadow-md transition-all border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle className="text-lg dark:text-slate-100">{quiz.topic}</CardTitle>
                            <CardDescription className="dark:text-slate-400">{quiz.questions.length} Questions • {new Date(quiz.createdAt.toDate()).toLocaleDateString()}</CardDescription>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                            onClick={() => setItemToDelete({ id: quiz.id!, type: 'quiz' })}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardFooter className="mt-auto">
                        <Button onClick={() => startQuiz(quiz)} className="w-full bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white">
                          Start Quiz
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                )}
              </motion.div>
            </TabsContent>

            <TabsContent key="tab-quiz-active" value="quiz-active" className="mt-0">
              {currentQuiz && (
                <motion.div 
                  key={`active-quiz-${currentQuiz.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="max-w-3xl mx-auto space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{currentQuiz.topic}</h2>
                      <p className="text-slate-500 dark:text-slate-400">Test your knowledge</p>
                    </div>
                    <Button variant="ghost" onClick={() => setActiveTab('quizzes')} className="dark:text-slate-400 dark:hover:bg-slate-800">Cancel</Button>
                  </div>

                  {quizSubmitted && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-indigo-600 dark:bg-indigo-700 text-white rounded-2xl p-8 text-center shadow-xl shadow-indigo-200 dark:shadow-none"
                    >
                      <div className="inline-flex p-3 bg-white/20 rounded-full mb-4">
                        <Sparkles size={32} />
                      </div>
                      <h3 className="text-3xl font-bold mb-2">
                        Quiz Results: {Object.entries(quizAnswers).filter(([idx, ans]) => ans === currentQuiz.questions[parseInt(idx)].correctAnswer).length} / {currentQuiz.questions.length}
                      </h3>
                      <p className="text-indigo-100 text-lg">
                        {Object.entries(quizAnswers).filter(([idx, ans]) => ans === currentQuiz.questions[parseInt(idx)].correctAnswer).length === currentQuiz.questions.length 
                          ? "Perfect Score! You're a master of this topic." 
                          : "Good effort! Review the explanations below to learn more."}
                      </p>
                    </motion.div>
                  )}

                  <div className="space-y-6">
                    {currentQuiz.questions.map((q, idx) => (
                      <Card key={`question-${idx}`} className={`border-slate-200 dark:border-slate-800 relative overflow-hidden bg-white dark:bg-slate-900 ${quizSubmitted ? (quizAnswers[idx] === q.correctAnswer ? 'border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-900/10' : 'border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/10') : ''}`}>
                        {quizSubmitted && (
                          <div className={`absolute top-0 right-0 px-4 py-1 text-[10px] font-bold uppercase tracking-wider rounded-bl-lg ${quizAnswers[idx] === q.correctAnswer ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                            {quizAnswers[idx] === q.correctAnswer ? 'Correct' : 'Incorrect'}
                          </div>
                        )}
                        <CardHeader>
                          <CardTitle className="text-base font-medium pr-16 dark:text-slate-100">
                            {idx + 1}. {q.question}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {q.options.map((option, oIdx) => (
                            <button
                              key={`option-${oIdx}`}
                              disabled={quizSubmitted}
                              onClick={() => setQuizAnswers(prev => ({ ...prev, [idx]: option }))}
                              className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between ${
                                quizAnswers[idx] === option 
                                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' 
                                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-300'
                              } ${
                                quizSubmitted && option === q.correctAnswer ? 'border-green-600 dark:border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : ''
                              } ${
                                quizSubmitted && quizAnswers[idx] === option && option !== q.correctAnswer ? 'border-red-600 dark:border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300' : ''
                              }`}
                            >
                              <span>{option}</span>
                              {quizSubmitted && option === q.correctAnswer && <CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />}
                              {quizSubmitted && quizAnswers[idx] === option && option !== q.correctAnswer && <XCircle size={18} className="text-red-600 dark:text-red-400" />}
                            </button>
                          ))}
                        </CardContent>
                        {quizSubmitted && (
                          <CardFooter className="bg-slate-50/50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 rounded-b-xl py-4">
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              <span className="font-bold">Explanation:</span> {q.explanation}
                            </p>
                          </CardFooter>
                        )}
                      </Card>
                    ))}
                  </div>

                  {!quizSubmitted ? (
                    <Button 
                      onClick={submitQuiz} 
                      disabled={Object.keys(quizAnswers).length < currentQuiz.questions.length}
                      className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700"
                    >
                      Submit Quiz
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <Button variant="outline" onClick={() => setActiveTab('quizzes')} className="w-full h-14">
                        Back to My Quizzes
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 dark:text-slate-400 text-sm">
          <p>© 2026 Lumina Learn. Powered by Google Gemini AI.</p>
        </div>
      </footer>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full p-6 space-y-6"
            >
              <div className="flex items-center gap-4 text-red-600 dark:text-red-400">
                <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-xl font-bold">Confirm Deletion</h3>
              </div>
              
              <p className="text-slate-600 dark:text-slate-400">
                Are you sure you want to delete this {itemToDelete.type}? This action cannot be undone and all associated data will be permanently removed.
              </p>
              
              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1 h-12 dark:border-slate-800 dark:text-slate-300"
                  onClick={() => setItemToDelete(null)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleDelete}
                >
                  Delete Permanently
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Note Modal */}
      <AnimatePresence>
        {editingNote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-6 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold dark:text-slate-50">Edit Study Note</h3>
                <Button variant="ghost" size="icon" onClick={() => setEditingNote(null)} className="dark:text-slate-400">
                  <XCircle size={20} />
                </Button>
              </div>
              
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4 pb-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Topic</label>
                    <Input 
                      value={editingNote.topic} 
                      onChange={(e) => setEditingNote({...editingNote, topic: e.target.value})}
                      className="dark:bg-slate-950 dark:border-slate-800 dark:text-slate-100"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Language</label>
                    <select 
                      value={editingNote.language} 
                      onChange={(e) => setEditingNote({...editingNote, language: e.target.value})}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                    >
                      <option value="English">English</option>
                      <option value="Bangla">Bangla</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Content (Markdown)</label>
                    <textarea 
                      value={editingNote.content} 
                      onChange={(e) => setEditingNote({...editingNote, content: e.target.value})}
                      className="w-full min-h-[300px] p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                    />
                  </div>
                </div>
              </ScrollArea>
              
              <div className="flex gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button 
                  variant="outline" 
                  className="flex-1 h-12 dark:border-slate-800 dark:text-slate-300"
                  onClick={() => setEditingNote(null)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={handleUpdateNote}
                >
                  Save Changes
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Note Modal */}
      <AnimatePresence>
        {viewingNote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{viewingNote.topic}</h3>
                    <span className="text-xs font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-md">
                      {viewingNote.language}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Generated on {new Date(viewingNote.createdAt.toDate()).toLocaleDateString()}
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setViewingNote(null)}
                  className="rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <XCircle size={24} className="text-slate-400 dark:text-slate-500" />
                </Button>
              </div>
              
              <ScrollArea className="flex-1 p-8 bg-slate-50/30 dark:bg-slate-950/30">
                <div className="max-w-3xl mx-auto prose prose-indigo prose-lg prose-slate dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-p:leading-relaxed prose-pre:bg-slate-900 dark:prose-pre:bg-black prose-pre:text-slate-100 rounded-2xl">
                  <ReactMarkdown>{viewingNote.content}</ReactMarkdown>
                </div>
              </ScrollArea>
              
              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setEditingNote(viewingNote);
                    setViewingNote(null);
                  }}
                  className="gap-2 dark:border-slate-800 dark:text-slate-300"
                >
                  <Pencil size={16} />
                  Edit Note
                </Button>
                <Button 
                  onClick={() => setViewingNote(null)}
                  className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white px-8"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
