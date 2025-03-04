
import { Course } from "@/lib/types";

interface WhatsAppPreviewProps {
  course: Course;
  selectedDay: number;
}

const WhatsAppPreview = ({ course, selectedDay }: WhatsAppPreviewProps) => {
  const day = course.days && course.days[selectedDay];
  
  if (!day) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
        <p className="text-muted-foreground">No content to preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-[#128C7E] p-4 text-white rounded-t-lg">
        <h3 className="font-semibold">WhatsApp Message Preview</h3>
      </div>
      <div className="bg-[#E5DDD5] p-3 flex-1 space-y-3 overflow-y-auto rounded-b-lg min-h-[400px]">
        {/* Course Title Message */}
        <div className="bg-white p-3 rounded-lg max-w-[80%] shadow-sm">
          <p className="font-bold">{course.title || "Course Title"}</p>
          <p className="text-sm text-gray-500 mt-1">Today's lesson:</p>
        </div>
        
        {/* Day Title Message */}
        <div className="bg-white p-3 rounded-lg max-w-[80%] shadow-sm">
          <p className="font-medium">{day.title || "Day Title"}</p>
        </div>
        
        {/* Content Messages */}
        {day.paragraphs.map((paragraph, index) => (
          paragraph.content && (
            <div key={index} className="bg-white p-3 rounded-lg max-w-[80%] shadow-sm">
              <p>{paragraph.content}</p>
            </div>
          )
        ))}
        
        {/* Media Message */}
        {day.media && (
          <div className="bg-white p-3 rounded-lg max-w-[80%] shadow-sm">
            <div className="bg-gray-100 p-2 rounded">
              <p className="text-blue-500 underline break-all">{day.media}</p>
            </div>
            <p className="text-sm text-gray-500 mt-1">Media attachment</p>
          </div>
        )}
        
        {/* Reply Instructions */}
        <div className="bg-white p-3 rounded-lg max-w-[80%] shadow-sm">
          <p>Reply with your answer or type HELP for assistance.</p>
        </div>
        
        {/* User Response Simulation */}
        <div className="bg-[#DCF8C6] p-3 rounded-lg max-w-[80%] ml-auto shadow-sm">
          <p>I understand the lesson. Thank you!</p>
          <p className="text-xs text-gray-500 text-right mt-1">12:35 PM</p>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppPreview;
