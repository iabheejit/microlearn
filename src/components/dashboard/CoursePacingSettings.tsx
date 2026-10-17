import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Course } from "@/lib/types";
import { listNudgeTemplates } from "@/lib/whatsapp-send.functions";

const NO_TEMPLATE = "__none__";

// Pacing: each course module is a day. Learners move lesson → Next → question within a day; the next
// day unlocks on this schedule. On WhatsApp the nudge template reopens the 24-hour window.
export default function CoursePacingSettings({
  course,
  onChange,
}: {
  course: Course;
  onChange: (patch: Partial<Course>) => void;
}) {
  const whatsapp = (course.deliveryChannel || "whatsapp") === "whatsapp";
  const mode = course.pacingMode || "immediate";
  const listTemplates = useServerFn(listNudgeTemplates);
  const {
    data: templates = [],
    isFetching,
    error,
  } = useQuery({
    queryKey: ["nudge-templates"],
    queryFn: () => listTemplates(),
    enabled: whatsapp,
    staleTime: 60_000,
    retry: false,
  });
  const timezones = useMemo(() => {
    const zones =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : ["UTC"];
    return zones.includes(course.pacingTimezone || "UTC")
      ? zones
      : [course.pacingTimezone || "UTC", ...zones];
  }, [course.pacingTimezone]);
  const selectedTemplate = course.whatsappNudgeTemplateName
    ? `${course.whatsappNudgeTemplateName}:${course.whatsappNudgeTemplateLanguage || ""}`
    : NO_TEMPLATE;
  const templateKnown =
    selectedTemplate === NO_TEMPLATE ||
    templates.some((t) => `${t.name}:${t.language}` === selectedTemplate);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Pacing</h2>
          <p className="text-sm text-muted-foreground">
            Each day of the course is unlocked in turn. Learners read a lesson,
            tap Next for its question, and can pause any time.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Next day unlocks</label>
            <Select
              value={mode}
              onValueChange={(value) =>
                onChange({
                  pacingMode: value as NonNullable<Course["pacingMode"]>,
                })
              }
            >
              <SelectTrigger aria-label="Day unlock mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">
                  Straight away (no waiting)
                </SelectItem>
                <SelectItem value="fixed_time">
                  At a set time on a later day
                </SelectItem>
                <SelectItem value="after_completion">
                  A number of days after finishing
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode !== "immediate" && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="pacing-gap">
                Days between course days
              </label>
              <Input
                id="pacing-gap"
                type="number"
                min={1}
                max={30}
                value={course.pacingGapDays ?? 1}
                onChange={(event) =>
                  onChange({ pacingGapDays: Number(event.target.value) || 1 })
                }
              />
            </div>
          )}
          {mode === "fixed_time" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="pacing-time">
                  Unlock time
                </label>
                <Input
                  id="pacing-time"
                  type="time"
                  value={course.pacingUnlockTime || "09:00"}
                  onChange={(event) =>
                    onChange({ pacingUnlockTime: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Timezone</label>
                <Select
                  value={course.pacingTimezone || "UTC"}
                  onValueChange={(value) => onChange({ pacingTimezone: value })}
                >
                  <SelectTrigger aria-label="Pacing timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        {whatsapp && (
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="pause-reminder">
                Remind paused learners after (hours)
              </label>
              <Input
                id="pause-reminder"
                type="number"
                min={0}
                max={168}
                value={course.pauseReminderHours ?? 24}
                onChange={(event) =>
                  onChange({
                    pauseReminderHours: Math.max(
                      0,
                      Number(event.target.value) || 0,
                    ),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                0 turns reminders off. One reminder is sent per pause.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nudge template</label>
              <Select
                value={selectedTemplate}
                onValueChange={(value) => {
                  if (value === NO_TEMPLATE)
                    return onChange({
                      whatsappNudgeTemplateName: "",
                      whatsappNudgeTemplateLanguage: "",
                    });
                  const template = templates.find(
                    (t) => `${t.name}:${t.language}` === value,
                  );
                  if (template)
                    onChange({
                      whatsappNudgeTemplateName: template.name,
                      whatsappNudgeTemplateLanguage: template.language,
                    });
                }}
                disabled={isFetching}
              >
                <SelectTrigger aria-label="Nudge template">
                  <SelectValue
                    placeholder={
                      isFetching
                        ? "Loading approved templates…"
                        : "Choose a template"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>None</SelectItem>
                  {!templateKnown && (
                    <SelectItem value={selectedTemplate}>
                      {course.whatsappNudgeTemplateName} (not approved now)
                    </SelectItem>
                  )}
                  {templates.map((t) => (
                    <SelectItem
                      key={`${t.name}:${t.language}`}
                      value={`${t.name}:${t.language}`}
                    >
                      {t.name} · {t.language}
                      {t.category ? ` · ${t.category.toLowerCase()}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                WhatsApp only allows a free message within 24 hours of the
                learner's last reply. After that, unlocks and reminders use this
                approved template ({"{{1}}"} = learner name, {"{{2}}"} = course
                title), ideally with a quick-reply "Start" button.
              </p>
              {templates.find(
                (t) => `${t.name}:${t.language}` === selectedTemplate,
              )?.category === "MARKETING" && (
                <p className="text-xs text-destructive">
                  Meta bills this template as marketing. Rewrite it as utility
                  on the Meta Templates page.
                </p>
              )}
              {error && (
                <p className="text-xs text-destructive">
                  Could not load templates from WhatsApp.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
