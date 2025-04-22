"use client";

import { Button } from "@/components/ui/button";
import Image from "next/image";
import React, { useContext, useEffect, useState, useRef } from "react";
import Webcam from "react-webcam";
import { Mic, Timer } from "lucide-react";
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
import { eq } from "drizzle-orm";
import { useAuth } from "@clerk/nextjs";
import { auth, currentUser } from '@clerk/nextjs/server'

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
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const { webCamEnabled, setWebCamEnabled } = useContext(WebCamContext);
  const webCamRef = useRef(null)
  const [warning, setWarning] = useState(false);
  const processingRef = useRef(false);

  const { userId } = useAuth();


  // Timer state variables
  const [timerActive, setTimerActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(120); // 60 seconds = 1 minute
  const timerRef = useRef(null);


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
      console.log(peopleCount, 'this is people count');

      if (peopleCount > 1) {
        // alert("Multiple people detected. The interview will be terminated.");
        setWarning(true);
        toast.error("Multiple people detected. The interview will be terminated if this continues.");
        // setWebCamEnabled(false);
      } else {
        setWarning(false);
      }
    };

    if (webCamEnabled) {
      loadModel().then(loadedModel => {
        model = loadedModel;
        interval = setInterval(detectPeople, 1000);
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

  // Format time to MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };


  const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);

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
  //     setLoading(true);
  //     const feedbackPrompt =
  //       "Question:" +
  //       mockInterviewQuestion[activeQuestionIndex]?.question +
  //       ", User Answer:" +
  //       userAnswer +
  //       " , Depends on question and user answer for given interview question" +
  //       " please give us rating for answer and feedback as area of improvement if any " +
  //       "in just 3 to 5 lines to improve it in JSON format with rating field and feedback field" +
  //       "also give me correct answer with answer field in that JSON data, it is compulsory to include 'correctAnswer' field in every data";

  //     const result = await chatSession.sendMessage(feedbackPrompt);

  //     let MockJsonResp = result.response.text();
  //     console.log(MockJsonResp);

  //     // Removing possible extra text around JSON
  //     MockJsonResp = MockJsonResp.replace("```json", "").replace("```", "");

  //     // Attempt to parse JSON
  //     let jsonFeedbackResp;
  //     try {
  //       jsonFeedbackResp = JSON.parse(MockJsonResp);
  //     } catch (e) {
  //       throw new Error("Invalid JSON response: " + MockJsonResp);
  //     }

  //     const resp = await db.insert(UserAnswer).values({
  //       mockIdRef: interviewData?.mockId,
  //       question: mockInterviewQuestion[activeQuestionIndex]?.question,
  //       // correctAns: mockInterviewQuestion[activeQuestionIndex]?.answer,
  //       correctAns: jsonFeedbackResp?.correctAnswer || jsonFeedbackResp?.answer,
  //       userAns: userAnswer,
  //       feedback: jsonFeedbackResp?.feedback,
  //       rating: jsonFeedbackResp?.rating,
  //       userEmail: user?.primaryEmailAddress?.emailAddress,
  //       createdAt: moment().format("YYYY-MM-DD"),
  //       hr_question_id: activeQuestionIndex
  //     });

  //     if (resp) {
  //       toast("User Answer recorded successfully");
  //     }
  //     setUserAnswer("");
  //     setLoading(false);
  //   } catch (error) {
  //     console.error(error);
  //     toast("An error occurred while recording the user answer");
  //     setLoading(false);
  //   }
  // };

  // const updateUserAnswer = async () => {
  //   try {
  //     setLoading(true);
  //     const feedbackPrompt =
  //       "Question:" +
  //       mockInterviewQuestion[activeQuestionIndex]?.question +
  //       ", User Answer:" +
  //       userAnswer +
  //       " , Depends on question and user answer for given interview question please give us rating for answer and feedback as area of improvement if any in just 3 to 5 lines to improve it in JSON format with rating field and feedback field also give me correct answer with answer field in that JSON data, it is compulsory to include 'correctAnswer' field in every data";

  //     const result = await chatSession.sendMessage(feedbackPrompt);
  //     // Await the text() method to get the actual string response
  //     let MockJsonResp = await result.response.text();
  //     console.log("Raw API response:", MockJsonResp);

  //     // Remove markdown code block formatting and extra spaces
  //     MockJsonResp = MockJsonResp.replace(/```(json)?/g, "").replace("```", "").trim();
  //     console.log("Cleaned JSON response:", MockJsonResp);

  //     // Parse the JSON response
  //     let jsonFeedbackResp;
  //     try {
  //       jsonFeedbackResp = JSON.parse(MockJsonResp);
  //     } catch (e) {
  //       throw new Error("Invalid JSON response: " + MockJsonResp);
  //     }

  //     // Check if a record with the current hr_question_id and mockIdRef already exists
  //     const existingRecord = await db
  //       .select()
  //       .from(UserAnswer)
  //       .where(
  //         eq(UserAnswer.hr_question_id, activeQuestionIndex),
  //         eq(UserAnswer.mockIdRef, interviewData?.mockId)
  //       );

  //     // Common values for both insert and update
  //     const answerData = {
  //       question: mockInterviewQuestion[activeQuestionIndex]?.question,
  //       correctAns: jsonFeedbackResp?.correctAnswer || jsonFeedbackResp?.answer,
  //       userAns: userAnswer,
  //       feedback: jsonFeedbackResp?.feedback,
  //       rating: jsonFeedbackResp?.rating,
  //       createdAt: moment().format("YYYY-MM-DD"),
  //     };

  //     if (existingRecord && existingRecord.length > 0) {
  //       // Update existing record
  //       await db
  //         .update(UserAnswer)
  //         .set(answerData)
  //         .where(
  //           eq(UserAnswer.hr_question_id, activeQuestionIndex),
  //           eq(UserAnswer.mockIdRef, interviewData?.mockId)
  //         );
  //       toast("User Answer updated successfully");
  //     } else {
  //       // Insert new record (add additional fields if needed)
  //       await db
  //         .insert(UserAnswer)
  //         .values({
  //           mockIdRef: interviewData?.mockId,
  //           userEmail: user?.primaryEmailAddress?.emailAddress,
  //           hr_question_id: activeQuestionIndex,
  //           ...answerData,
  //         });
  //       toast("User Answer recorded successfully");
  //     }
  //     setUserAnswer("");
  //   } catch (error) {
  //     console.error("Error:", error);
  //     toast("An error occurred while recording the user answer");
  //   } finally {
  //     setLoading(false);
  //   }
  // };


  const updateUserAnswer = async () => {
    console.log('entered in update answer')
    try {
      setIsRecordingAnswer(true);
      processingRef.current = true;
      setLoading(true);
      // const { id } = useAuth(); // Get user ID from Clerk
      // if (!id) throw new Error("User not authenticated");
      // Use the userId from useAuth hook
      console.log(userId, 'this is user id')

      // Check if user is authenticated
      if (!userId) {
        toast("Please sign in to continue");
        return;
      }



      const feedbackPrompt =
        "Question:" +
        mockInterviewQuestion[activeQuestionIndex]?.question +
        ", User Answer:" +
        userAnswer +
        " , Depends on question and user answer for given interview question please give us rating for answer and feedback as area of improvement if any in just 3 to 5 lines to improve it in JSON format with rating field and feedback field also give me correct answer with answer field in that JSON data, it is compulsory to include 'correctAnswer' field in every data";

      const result = await chatSession.sendMessage(feedbackPrompt);
      let MockJsonResp = await result.response.text();
      console.log("Raw API response:", MockJsonResp);

      // Remove markdown formatting
      MockJsonResp = MockJsonResp.replace(/```(json)?/g, "").replace("```", "").trim();
      console.log("Cleaned JSON response:", MockJsonResp);

      let jsonFeedbackResp;
      try {
        jsonFeedbackResp = JSON.parse(MockJsonResp);
      } catch (e) {
        throw new Error("Invalid JSON response: " + MockJsonResp);
      }

      const existingRecord = await db
        .select()
        .from(UserAnswer)
        .where(
          eq(UserAnswer.hr_question_id, activeQuestionIndex),
          eq(UserAnswer.mockIdRef, interviewData?.mockId),
          eq(UserAnswer.user_id, userId) // Ensure it's tied to the logged-in user
        );

      const answerData = {
        question: mockInterviewQuestion[activeQuestionIndex]?.question,
        correctAns: jsonFeedbackResp?.correctAnswer || jsonFeedbackResp?.answer,
        userAns: userAnswer,
        feedback: jsonFeedbackResp?.feedback,
        rating: jsonFeedbackResp?.rating,
        createdAt: moment().format("YYYY-MM-DD"),
      };

      if (existingRecord && existingRecord.length > 0) {
        await db
          .update(UserAnswer)
          .set(answerData)
          .where(
            eq(UserAnswer.hr_question_id, activeQuestionIndex),
            eq(UserAnswer.mockIdRef, interviewData?.mockId),
            eq(UserAnswer.user_id, userId) // Update only for the logged-in user
          );
        toast("User Answer updated successfully");
      } else {
        await db
          .insert(UserAnswer)
          .values({
            user_id: userId, // Store user_id in the database
            mockIdRef: interviewData?.mockId,
            userEmail: user?.primaryEmailAddress?.emailAddress,
            hr_question_id: activeQuestionIndex,
            ...answerData,
          });
        toast("User Answer recorded successfully");
      }
      setUserAnswer("");
      setIsRecordingAnswer(false);
    } catch (error) {
      console.log('no auth id found')
      console.error("Error:", error);
      toast("An error occurred while recording the user answer");
    } finally {
      setLoading(false);
      processingRef.current = false;
    }
  };


  return (
    <div className="flex flex-col items-center justify-center overflow-hidden">
      <div className="flex flex-col justify-center items-center rounded-lg p-5 bg-black mt-4 w-[30rem] ">
        {webCamEnabled ? (
          <Webcam
            ref={webCamRef}
            mirrored={true}
            style={{ height: 250, width: "100%", zIndex: 10 }}
          />
        ) : (
          <Image src={"/camera.jpg"} width={200} height={200} alt="Camera placeholder" />
        )}

        {warning && (
          <div className="absolute top-2 left-2 right-2 bg-red-500 text-white p-2 rounded-lg text-center">
            Warning: Multiple people detected!
          </div>
        )}


        {timerActive && (
          <div className="absolute top-8 right-8 bg-black bg-opacity-70 text-white px-3 py-2 rounded-lg flex items-center">
            <Timer className="mr-2" size={18} />
            <span className={`font-mono text-xl ${timeRemaining <= 10 ? 'text-red-500' : ''}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
        )}


      </div>
      {/* <div className="md:flex mt-4 md:mt-8 md:gap-5">
        <Button
          variant="outline"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={loading}
        >
          {isRecording ? (
            <h2 className="text-red-400 flex gap-2 ">
              <Mic /> Stop Recording...
            </h2>
          ) : (
            " Record Answer"
          )}
        </Button>
      </div> */}


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

