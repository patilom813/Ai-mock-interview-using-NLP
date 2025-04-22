"use client";

import { Button } from "@/components/ui/button";
import Image from "next/image";
import React, { useContext, useEffect, useState, useRef } from "react";
import Webcam from "react-webcam";
import { CloudCog, Mic, Timer } from "lucide-react";
import { toast } from "sonner";
import { chatSession } from "@/utils/GeminiAIModal";
import { db } from "@/utils/db";
import { UserAnswer } from "@/utils/schema";
import { useUser } from "@clerk/nextjs";
import moment from "moment";
import { WebCamContext } from "@/app/dashboard/layout";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import "@tensorflow/tfjs";
import { and, eq } from "drizzle-orm";

const RecordAnswerSection = ({
  mockInterviewQuestion,
  activeQuestionIndex,
  interviewData,
  setActiveQuestionIndex,
  setIsRecordingAnswer,
  isRecordingAnswer
}) => {
  const [userAnswer, setUserAnswer] = useState("");
  const { user } = useUser();
  console.log(user, 'this is user object')
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const { webCamEnabled, setWebCamEnabled } = useContext(WebCamContext);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const webCamRef = useRef(null);
  const [warning, setWarning] = useState(false);
  const currentQuestionRef = useRef(activeQuestionIndex);
  const processingRef = useRef(false);

  // Timer state variables
  const [timerActive, setTimerActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(120); // 120 seconds = 2 minutes
  const timerRef = useRef(null);

  const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);

  // Update the ref when activeQuestionIndex changes
  useEffect(() => {
    currentQuestionRef.current = activeQuestionIndex;
  }, [activeQuestionIndex]);

  useEffect(() => {
    if (!isRecording && userAnswer.length > 10 && !processingRef.current) {
      updateUserAnswer();
    }
  }, [userAnswer]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setTimerActive(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      toast("Error starting recording. Please check your microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setTimerActive(false);
    }

    setTimeRemaining(120);
  };

  const transcribeAudio = async (audioBlob) => {
    try {
      setIsRecordingAnswer(true);
      setLoading(true);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Convert audio blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];

        const result = await model.generateContent([
          "Transcribe the following audio:",
          { inlineData: { data: base64Audio, mimeType: "audio/webm" } },
        ]);

        const transcription = result.response.text();
        setUserAnswer((prevAnswer) => prevAnswer + " " + transcription);
        setLoading(false);
      };
    } catch (error) {
      console.error("Error transcribing audio:", error);
      toast("Error transcribing audio. Please try again.");
      setLoading(false);
    }
  };

  // const updateUserAnswer = async () => {
  //   try {
  //     processingRef.current = true;
  //     setLoading(true);

  //     // Use the captured question index, not the current active one
  //     const questionIndex = currentQuestionRef.current;
  //     const question = mockInterviewQuestion[questionIndex];

  //     if (!question) {
  //       console.error("Question not found for index:", questionIndex);
  //       toast("Error: Question data not found");
  //       setLoading(false);
  //       processingRef.current = false;
  //       return;
  //     }

  //     const feedbackPrompt =
  //       "Question:" +
  //       question.Question +
  //       ", User Answer:" +
  //       userAnswer +
  //       " , Depends on question and user answer for given interview question" +
  //       " please give us rating for answer and feedback as area of improvement if any " +
  //       "in just 3 to 5 lines to improve it in JSON format with rating field and feedback field";

  //     const result = await chatSession.sendMessage(feedbackPrompt);

  //     let MockJsonResp = result.response.text();
  //     console.log("Response for question index:", questionIndex, MockJsonResp);

  //     // Removing possible extra text around JSON
  //     MockJsonResp = MockJsonResp.replace("```json", "").replace("```", "");

  //     // Attempt to parse JSON
  //     let jsonFeedbackResp;
  //     try {
  //       jsonFeedbackResp = JSON.parse(MockJsonResp);
  //     } catch (e) {
  //       throw new Error("Invalid JSON response: " + MockJsonResp);
  //     }

  //     const response = await db.

  //     const resp = await db.insert(UserAnswer).values({
  //       mockIdRef: interviewData?.mockId,
  //       question: question.Question,
  //       correctAns: question.Answer,
  //       userAns: userAnswer,
  //       feedback: jsonFeedbackResp?.feedback,
  //       rating: jsonFeedbackResp?.rating,
  //       userEmail: user?.primaryEmailAddress?.emailAddress,
  //       createdAt: moment().format("YYYY-MM-DD"),
  //     });

  //     if (resp) {
  //       toast(`Answer for Question #${questionIndex + 1} recorded successfully`);
  //     }
  //     setUserAnswer("");
  //     setLoading(false);
  //     processingRef.current = false;
  //   } catch (error) {
  //     console.error(error);
  //     toast("An error occurred while recording the user answer");
  //     setLoading(false);
  //     processingRef.current = false;
  //   }
  // };

  const updateUserAnswer = async () => {
    try {
      setIsRecordingAnswer(true);
      processingRef.current = true;
      setLoading(true);

      // Use the captured question index, not the current active one
      const questionIndex = currentQuestionRef.current;
      const question = mockInterviewQuestion[questionIndex];

      if (!question) {
        console.error("Question not found for index:", questionIndex);
        toast("Error: Question data not found");
        setLoading(false);
        processingRef.current = false;
        return;
      }

      // Make sure user is authenticated and has email
      const userEmail = user?.primaryEmailAddress?.emailAddress;
      if (!userEmail) {
        console.error("User email not found");
        toast("Error: User authentication issue");
        setLoading(false);
        processingRef.current = false;
        return;
      }

      const feedbackPrompt =
        "Question:" +
        question.Question +
        ", User Answer:" +
        userAnswer +
        " , Depends on question and user answer for given interview question" +
        " please give us rating for answer and feedback as area of improvement if any " +
        "in just 3 to 5 lines to improve it in JSON format with rating field and feedback field";

      const result = await chatSession.sendMessage(feedbackPrompt);
      let MockJsonResp = result.response.text();
      console.log("Response for question index:", questionIndex, MockJsonResp);

      // Removing possible extra text around JSON
      MockJsonResp = MockJsonResp.replace("```json", "").replace("```", "");

      // Attempt to parse JSON
      let jsonFeedbackResp;
      try {
        jsonFeedbackResp = JSON.parse(MockJsonResp);
      } catch (e) {
        throw new Error("Invalid JSON response: " + MockJsonResp);
      }

      // Check if an answer already exists for this question and interview
      const existingAnswers = await db
        .select()
        .from(UserAnswer)
        .where(
          and(
            eq(UserAnswer.mockIdRef, interviewData?.mockId),
            eq(UserAnswer.question, question.Question),
            eq(UserAnswer.userEmail, userEmail)
          )
        );

      // If existing answer found, delete it
      if (existingAnswers && existingAnswers.length > 0) {
        console.log(`Deleting existing answer for question "${question.Question}" by ${userEmail}`);
        await db
          .delete(UserAnswer)
          .where(
            and(
              eq(UserAnswer.mockIdRef, interviewData?.mockId),
              eq(UserAnswer.question, question.Question),
              eq(UserAnswer.userEmail, userEmail)
            )
          );
      }

      // Now insert the new record
      const resp = await db.insert(UserAnswer).values({
        mockIdRef: interviewData?.mockId,
        question: question.Question,
        correctAns: question.Answer,
        userAns: userAnswer,
        feedback: jsonFeedbackResp?.feedback,
        rating: jsonFeedbackResp?.rating,
        userEmail: userEmail,
        createdAt: moment().format("YYYY-MM-DD"),
        userId: user?.id || null, // Add the Clerk user ID if available
        userFullName: user?.fullName || null // Add user's full name if available
      });

      if (resp) {
        toast(`Answer for Question #${questionIndex + 1} ${existingAnswers?.length > 0 ? 'updated' : 'recorded'} successfully`);
      }

      setUserAnswer("");
      setLoading(false);
      processingRef.current = false;
      setIsRecordingAnswer(false);
    } catch (error) {
      console.error(error);
      toast("An error occurred while recording the user answer");
      setLoading(false);
      processingRef.current = false;
    }
  };

  useEffect(() => {
    let interval;
    let model;

    const loadModel = async () => {
      model = await cocoSsd.load();
      return model;
    };

    const detectPeople = async () => {
      if (!webCamRef.current || !webCamRef.current.video || webCamRef.current.video.readyState !== 4) {
        return;
      }

      const video = webCamRef.current.video;
      const predictions = await model.detect(video);

      const peopleCount = predictions.filter(pred => pred.class === "person").length;

      if (peopleCount > 1) {
        setWarning(true);
        toast.error("Multiple people detected. The interview will be terminated if this continues.");
      } else {
        setWarning(false);
      }
    };

    if (webCamEnabled) {
      loadModel().then(loadedModel => {
        model = loadedModel;
        interval = setInterval(detectPeople, 2000); // Check less frequently to reduce load
      });
    }

    return () => clearInterval(interval);
  }, [webCamEnabled, setWebCamEnabled]);

  useEffect(() => {
    if (timerActive && timeRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setTimeRemaining(prevTime => prevTime - 1);
      }, 1000);
    } else if (timerActive && timeRemaining === 0) {
      // When timer hits zero, stop recording and move to next question
      handleTimerComplete();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timerActive, timeRemaining]);

  const handleTimerComplete = async () => {
    setTimerActive(false);
    if (isRecording) {
      await stopRecording();
    }

    // Wait for answer processing to complete before moving to next question
    if (userAnswer.length > 10) {
      await updateUserAnswer();
    }

    // Move to next question
    toast("Time's up! Moving to next question.");

    // Check if there are more questions
    if (activeQuestionIndex < mockInterviewQuestion.length - 1) {
      setActiveQuestionIndex(activeQuestionIndex + 1);
    } else {
      toast("Interview completed!");
    }

    // Reset timer for next question
    setTimeRemaining(120);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleNavigationLock = () => {
    if (isRecording || loading || processingRef.current) {
      return "Please complete recording before navigating away.";
    }
    return null;
  };

  return (
    <div className="flex flex-col items-center justify-center overflow-hidden">
      {warning && (
          <div className="absolute top-2 left-2 right-2 bg-red-500 text-white p-2 rounded-lg text-center">
            Warning: Multiple people detected!
          </div>
        )}
      <div className="flex flex-col justify-center items-center relative rounded-lg p-5 bg-black mt-4 w-full md:w-[30rem]">
        {webCamEnabled ? (
          <Webcam
            ref={webCamRef}
            mirrored={true}
            style={{ height: 250, width: "100%", zIndex: 10 }}
          />
        ) : (
          <Image src={"/camera.jpg"} width={200} height={200} alt="Camera placeholder" />
        )}
        
      </div>
      
      {/* Timer moved outside the webcam container to upper right of screen */}
      {timerActive && (
        <div className="fixed top-4 right-4 bg-black bg-opacity-80 text-white px-3 py-2 rounded-lg flex items-center shadow-lg z-50">
          <Timer className="mr-2" size={20} />
          <span className={`font-mono text-xl font-bold ${timeRemaining <= 10 ? 'text-red-500' : ''}`}>
            {formatTime(timeRemaining)}
          </span>
        </div>
      )}
      
      <div className="md:flex mt-4 md:mt-8 md:gap-5">
        <Button
          variant={isRecording ? "destructive" : "outline"}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={loading || processingRef.current}
          className={isRecording ? "animate-pulse" : ""}
        >
          {isRecording ? (
            <h2 className="flex gap-2 items-center">
              <Mic className="text-white" /> Stop Recording...
            </h2>
          ) : loading ? (
            "Processing..."
          ) : (
            "Record Answer"
          )}
        </Button>
      </div>
      {loading && (
        <div className="mt-4 text-center text-gray-600">
          <p>Processing your answer...</p>
        </div>
      )}
      {/* Status indicator for debugging */}
      <div className="mt-4 text-xs text-gray-400">
        {isRecording ? "Recording..." :
          loading ? "Processing..." :
            processingRef.current ? "Saving answer..." :
              "Ready"}
        {` | Question #${activeQuestionIndex + 1}`}
      </div>
    </div>
  );
};

export default RecordAnswerSection;