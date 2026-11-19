/**
 * sample.ts — a demo wedding.
 * -----------------------------------------------------------------------------
 * Household and vendor names follow the planner design prototype
 * (`public/assets/design/Avisha Planner.dc.html`). Everything here is invented
 * demo data; the couple's names are placeholders the planner lets you change.
 */

import type { Wedding } from "./types";

export const SAMPLE_WEDDING: Wedding = {
  id: "demo-wedding",
  couple: { partnerA: "Aarohi", partnerB: "Vivaan" },
  tradition: "hindu",
  events: [
    {
      id: "ev-engagement",
      chapter: "engagement",
      title: "Ring Ceremony",
      date: "2027-02-11",
      startTime: "18:30",
      venue: "Marble Pavilion, Udaipur",
    },
    {
      id: "ev-mehendi",
      chapter: "mehendi",
      title: "Mehendi",
      date: "2027-02-12",
      startTime: "11:00",
      venue: "Banyan Courtyard",
      notes: "Henna stations open from 11:00.",
    },
    {
      id: "ev-sangeet",
      chapter: "sangeet",
      title: "Sangeet Night",
      date: "2027-02-12",
      startTime: "19:30",
      venue: "Lakeside Amphitheatre",
      notes: "Dhol entry at 19:45.",
    },
    {
      id: "ev-wedding",
      chapter: "wedding",
      title: "Pheras",
      date: "2027-02-13",
      startTime: "16:00",
      venue: "Temple Lawn",
    },
    {
      id: "ev-reception",
      chapter: "reception",
      title: "Reception Dinner",
      date: "2027-02-13",
      startTime: "20:30",
      venue: "Glass Conservatory",
    },
  ],
  households: [
    {
      id: "hh-mehta",
      name: "Mehta",
      city: "Ahmedabad",
      guests: [
        {
          id: "g-kavita-mehta",
          name: "Kavita Mehta",
          rsvp: {
            "ev-mehendi": "yes",
            "ev-sangeet": "yes",
            "ev-wedding": "yes",
            "ev-reception": "pending",
          },
          dietary: "Vegetarian",
          needsRoom: true,
          travel: "Flight, arrives 11 Feb",
        },
        {
          id: "g-raj-mehta",
          name: "Raj Mehta",
          rsvp: {
            "ev-sangeet": "yes",
            "ev-wedding": "yes",
            "ev-reception": "yes",
          },
          needsRoom: true,
          travel: "Flight, arrives 11 Feb",
        },
      ],
    },
    {
      id: "hh-jain",
      name: "Jain household",
      city: "Mumbai",
      notes: "Jain meals at every event.",
      guests: [
        {
          id: "g-sunita-jain",
          name: "Sunita Jain",
          rsvp: {
            "ev-engagement": "yes",
            "ev-mehendi": "pending",
            "ev-wedding": "yes",
          },
          dietary: "Jain (no root vegetables)",
          needsRoom: true,
          travel: "Train to Udaipur City",
        },
        {
          id: "g-arjun-jain",
          name: "Arjun Jain",
          rsvp: { "ev-wedding": "no", "ev-reception": "pending" },
          dietary: "Jain (no root vegetables)",
        },
      ],
    },
  ],
  vendors: [
    {
      id: "v-zoya",
      name: "Zoya Henna Atelier",
      category: "Mehendi artist",
      eventIds: ["ev-mehendi"],
      status: "confirmed",
      amount: 85000,
      paid: 85000,
    },
    {
      id: "v-rasoi",
      name: "Rasoi Collective",
      category: "Catering",
      eventIds: ["ev-sangeet", "ev-wedding", "ev-reception"],
      status: "booked",
      amount: 1200000,
      paid: 400000,
    },
    {
      id: "v-roshan",
      name: "Roshan Lighting",
      category: "Lighting & decor",
      eventIds: ["ev-sangeet", "ev-reception"],
      status: "booked",
      amount: 350000,
      paid: 0,
    },
    {
      id: "v-suryan",
      name: "Suryan Films",
      category: "Photo & film",
      eventIds: ["ev-engagement", "ev-mehendi", "ev-sangeet", "ev-wedding", "ev-reception"],
      status: "enquiry",
      amount: 600000,
    },
  ],
};
