"use client";
import { db } from "@/utils/db";
import { HRQuestion, MockInterview, UserAnswer } from "@/utils/schema";
import { eq } from "drizzle-orm";
import { Lightbulb, WebcamIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Webcam from "react-webcam";
import Link from "next/link";
import { useContext } from 'react';
import { WebCamContext } from "../layout";
import { useAuth } from "@clerk/nextjs";

const Interview = ({ params }) => {
    const { webCamEnabled, setWebCamEnabled } = useContext(WebCamContext);
    const [interviewData, setInterviewData] = useState();
    const { userId } = useAuth();
    // const [webCamEnabled, setWebCamEnebled] = useState(false);
    useEffect(() => {
        // console.log(params.interviewId);
        GetInterviewDetails();
    }, []);

    const GetInterviewDetails = async () => {
        console.log('entered in get interview')
        const result = await db
            .select()
            .from(HRQuestion)
            .where(eq(HRQuestion.mockId, 1));

        console.log(result, 'this is result')

        setInterviewData(result[0]);
    };

    const handleDeletePreviousResponse = async () => {
        try {
            console.log('Deleting previous responses...');
            console.log(userId)
            // await db.delete(UserAnswer).where(eq(UserAnswer.user_id, userId));
            await db.delete(UserAnswer).where(eq(UserAnswer.mockIdRef, 1));
            console.log('Deletion successful');
        } catch (error) {
            console.error('Error deleting previous responses:', error);
        }
    };

    return (
        <div className="my-10">
            <h2 className="font-bold text-2xl text-center">Let's Get Started</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 ">
                <div className="flex flex-col my-5 gap-5">
                    <div className="flex flex-col p-5 rounded-lg border gap-5">
                        <h2 className="text-lg">
                            <strong>Job Role/Job Position: </strong>
                            {interviewData?.jobPosition}
                        </h2>
                        <h2 className="text-lg">
                            <strong>Job Description/Job Stack: </strong>
                            {interviewData?.jobDesc}
                        </h2>
                        <h2 className="text-lg">
                            <strong>Years of Experience: </strong>
                            {interviewData?.jobExperience}
                        </h2>
                    </div>
                    <div className="p-5 border rounded-lg border-yellow-300 bg-yellow-100">
                        <h2 className="flex gap-2 items-center text-yellow-700 mb-2">
                            <Lightbulb />
                            <strong>Information</strong>
                        </h2>
                        <h2 className="mt-3 text-yellow-500">
                            {process.env.NEXT_PUBLIC_INFORMATION}
                        </h2>
                    </div>
                    <div className="p-5 border rounded-lg border-yellow-300 bg-yellow-100">
                        <Link href={"/dashboard/hr-interview/feedback"}>View Previous Feedback</Link>
                    </div>
                </div>
                <div>
                    {webCamEnabled ? (
                        <div className=" flex items-center justify-center p-10">
                            <Webcam
                                onUserMedia={() => setWebCamEnabled(true)}
                                onUserMediaError={() => setWebCamEnabled(false)}
                                height={300}
                                width={300}
                                mirrored={true}
                            />
                        </div>
                    ) : (
                        <div>
                            <WebcamIcon className="h-72 w-full my-6 p-20 bg-secondary rounded-lg border" />
                        </div>
                    )}
                    <div>
                        <Button
                            className={`${webCamEnabled ? "w-full" : "w-full"}`}
                            onClick={() => setWebCamEnabled((prev) => !prev)}
                        >
                            {webCamEnabled ? "Close WebCam" : "Enable WebCam"}
                        </Button>
                    </div>
                </div>
            </div>
            <div className="flex justify-center my-4 md:my-0 md:justify-end md:items-end">
                {/* <Link href={"/dashboard/hr-interview/" + params.interviewId + "/start"}> */}
                <Link href={"/dashboard/hr-interview/start"}>
                    <Button onClick={() => handleDeletePreviousResponse()} disabled={!webCamEnabled} >Start Interview</Button>
                </Link>
            </div>
        </div>
    );
};

export default Interview;
