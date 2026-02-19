#!/usr/bin/env swift
// cal_query.swift — Fast calendar query using EventKit (indexed database access)
// Usage: swift cal_query.swift <calendar_name> <days_ahead> [output_format]
// Example: swift cal_query.swift "Cantu" 7
// Example: swift cal_query.swift "Cantu" 14 summary
//
// Output formats:
//   full (default) — start|||end|||title  (one per line)
//   summary        — business day availability summary for scan-email escalation logic
//
// Why this exists:
// AppleScript's `whose` clause walks every event object sequentially (O(n) on total
// calendar size). For calendars with 7000+ events, this times out even with a narrow
// date range. EventKit uses the CalendarStore database with proper indexing, making
// queries instant regardless of calendar size.

import EventKit
import Foundation

// Parse arguments
let args = CommandLine.arguments
guard args.count >= 3 else {
    fputs("Usage: swift cal_query.swift <calendar_name> <days_ahead> [output_format]\n", stderr)
    exit(1)
}

let calendarName = args[1]
let daysAhead = Int(args[2]) ?? 7
let outputFormat = args.count >= 4 ? args[3] : "full"

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)

func queryCalendar(store: EKEventStore) {
    let cal = Calendar.current
    let startDate = cal.startOfDay(for: Date())
    guard let endDate = cal.date(byAdding: .day, value: daysAhead, to: startDate) else {
        print("ERROR: Invalid date range")
        semaphore.signal()
        return
    }

    // Find the target calendar
    let allCalendars = store.calendars(for: .event)
    guard let targetCal = allCalendars.first(where: { $0.title == calendarName }) else {
        print("ERROR: Calendar '\(calendarName)' not found")
        print("Available calendars: \(allCalendars.map { $0.title }.joined(separator: ", "))")
        semaphore.signal()
        return
    }

    let predicate = store.predicateForEvents(withStart: startDate, end: endDate, calendars: [targetCal])
    let events = store.events(matching: predicate)

    let df = DateFormatter()
    df.dateFormat = "yyyy-MM-dd HH:mm"

    let dayFmt = DateFormatter()
    dayFmt.dateFormat = "yyyy-MM-dd"

    if outputFormat == "summary" {
        // Business day availability summary for scan-email escalation logic
        // Groups events by day, calculates busy hours, identifies PTO/OOO days
        var dayBusy: [String: Double] = [:]
        var ptoOooDays: Set<String> = []
        var totalBusinessDays = 0

        // Walk each day in the range
        var current = startDate
        while current < endDate {
            let weekday = cal.component(.weekday, from: current)
            // Skip weekends (1=Sunday, 7=Saturday)
            if weekday != 1 && weekday != 7 {
                let dayKey = dayFmt.string(from: current)
                dayBusy[dayKey] = 0
                totalBusinessDays += 1
            }
            current = cal.date(byAdding: .day, value: 1, to: current)!
        }

        for event in events {
            let dayKey = dayFmt.string(from: event.startDate)
            guard dayBusy[dayKey] != nil else { continue }

            // Check for all-day PTO/OOO events
            if event.isAllDay {
                let title = (event.title ?? "").lowercased()
                if title.contains("pto") || title.contains("ooo") || title.contains("out of office") ||
                   title.contains("vacation") || title.contains("time off") || title.contains("holiday") {
                    ptoOooDays.insert(dayKey)
                }
            } else {
                // Calculate busy hours
                let duration = event.endDate.timeIntervalSince(event.startDate) / 3600.0
                dayBusy[dayKey] = (dayBusy[dayKey] ?? 0) + duration
            }
        }

        // Calculate available days (business days minus PTO, minus days with <2h free)
        let workdayHours = 8.0
        var availableDays = 0
        let sortedDays = dayBusy.keys.sorted()

        print("DAY_SUMMARY:")
        for day in sortedDays {
            let busy = dayBusy[day] ?? 0
            let free = workdayHours - busy
            let isPTO = ptoOooDays.contains(day)
            let isAvailable = !isPTO && free >= 2.0 && busy < 7.0
            if isAvailable { availableDays += 1 }
            print("\(day)|\(String(format: "%.1f", busy))h_busy|\(String(format: "%.1f", free))h_free|\(isPTO ? "PTO" : "available")")
        }
        print("BUSINESS_DAYS: \(totalBusinessDays)")
        print("PTO_DAYS: \(ptoOooDays.count)")
        print("AVAILABLE_DAYS: \(availableDays)")
    } else {
        // Full event list output
        for event in events {
            let start = df.string(from: event.startDate)
            let end = df.string(from: event.endDate)
            let title = event.title ?? "(no title)"
            let allDay = event.isAllDay ? "ALL_DAY" : ""
            print("\(start)|||\(end)|||\(title)|||\(allDay)")
        }
        print("TOTAL: \(events.count) events")
    }
    semaphore.signal()
}

// Request access and run
if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { granted, error in
        if !granted {
            print("ERROR: Calendar access not granted. Check System Settings > Privacy > Calendars.")
            semaphore.signal()
            return
        }
        queryCalendar(store: store)
    }
} else {
    store.requestAccess(to: .event) { granted, error in
        if !granted {
            print("ERROR: Calendar access not granted. Check System Settings > Privacy > Calendars.")
            semaphore.signal()
            return
        }
        queryCalendar(store: store)
    }
}

semaphore.wait()
