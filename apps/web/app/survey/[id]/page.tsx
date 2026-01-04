'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Star, CheckCircle, MessageCircle } from 'lucide-react';

interface Question {
  id: string;
  type: 'rating' | 'text' | 'choice' | 'nps';
  text: string;
  options?: string[];
  required?: boolean;
}

interface Survey {
  id: string;
  completed_at?: string;
  survey_templates: {
    name: string;
    description?: string;
    questions: Question[];
    thank_you_message: string;
  };
}

export default function SurveyPage() {
  const params = useParams();
  const surveyId = params.id as string;
  
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (surveyId) {
      fetchSurvey();
    }
  }, [surveyId]);

  const fetchSurvey = async () => {
    try {
      const res = await fetch(`${API_URL}/api/surveys/${surveyId}`);
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setSurvey(data.survey);
        if (data.survey.completed_at) {
          setSubmitted(true);
        }
      }
    } catch (err) {
      setError('فشل في تحميل الاستبيان');
    } finally {
      setLoading(false);
    }
  };

  const submitSurvey = async () => {
    if (!survey) return;

    // Validate required questions
    const requiredQuestions = survey.survey_templates.questions.filter(q => q.required);
    for (const q of requiredQuestions) {
      if (!responses[q.id]) {
        alert(`يرجى الإجابة على: ${q.text}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/surveys/respond/${surveyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses }),
      });

      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        alert(data.error || 'فشل في إرسال الاستبيان');
      }
    } catch (err) {
      alert('فشل في إرسال الاستبيان');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4" dir="rtl">
        <div className="text-center">
          <Star className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">الاستبيان غير موجود</h1>
          <p className="text-gray-500">{error || 'تأكد من الرابط وحاول مرة أخرى'}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            شكراً لمشاركتك! 🙏
          </h1>
          <p className="text-gray-600">
            {survey.survey_templates.thank_you_message}
          </p>
        </div>
      </div>
    );
  }

  const template = survey.survey_templates;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4 py-8" dir="rtl">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 text-center">
          <div className="w-16 h-16 mx-auto bg-purple-100 rounded-full flex items-center justify-center mb-4">
            <Star className="w-8 h-8 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {template.name}
          </h1>
          {template.description && (
            <p className="text-gray-600">{template.description}</p>
          )}
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {template.questions.map((question, index) => (
            <div key={question.id} className="bg-white rounded-xl shadow-sm p-6">
              <p className="font-medium text-gray-900 mb-4">
                {index + 1}. {question.text}
                {question.required && <span className="text-red-500 mr-1">*</span>}
              </p>

              {question.type === 'rating' && (
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setResponses({ ...responses, [question.id]: star })}
                      className="p-2 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-10 h-10 ${
                          responses[question.id] >= star
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              )}

              {question.type === 'nps' && (
                <div className="flex flex-wrap justify-center gap-2">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <button
                      key={num}
                      onClick={() => setResponses({ ...responses, [question.id]: num })}
                      className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                        responses[question.id] === num
                          ? num <= 6
                            ? 'bg-red-500 text-white'
                            : num <= 8
                            ? 'bg-yellow-500 text-white'
                            : 'bg-green-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                  <div className="w-full flex justify-between text-xs text-gray-400 mt-2 px-2">
                    <span>غير راضي</span>
                    <span>راضي جداً</span>
                  </div>
                </div>
              )}

              {question.type === 'choice' && question.options && (
                <div className="space-y-2">
                  {question.options.map(option => (
                    <button
                      key={option}
                      onClick={() => setResponses({ ...responses, [question.id]: option })}
                      className={`w-full p-3 rounded-lg text-right transition-colors ${
                        responses[question.id] === option
                          ? 'bg-purple-100 border-2 border-purple-500 text-purple-700'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-2 border-transparent'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              {question.type === 'text' && (
                <textarea
                  value={responses[question.id] || ''}
                  onChange={(e) => setResponses({ ...responses, [question.id]: e.target.value })}
                  placeholder="اكتب إجابتك هنا..."
                  rows={3}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              )}
            </div>
          ))}
        </div>

        {/* Submit Button */}
        <button
          onClick={submitSurvey}
          disabled={submitting}
          className="w-full mt-6 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white py-4 rounded-xl font-bold text-lg transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              جاري الإرسال...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              إرسال التقييم
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          إجاباتك سرية ولن تُشارك مع أي طرف ثالث
        </p>
      </div>
    </div>
  );
}
