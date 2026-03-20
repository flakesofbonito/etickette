export const REASONS = {
    cashier: [
        { label: "Pay Tuition / Fees",       docs: ["Valid ID"] },
        { label: "Request Official Receipt",  docs: ["Valid ID", "Proof of Payment"] },
        { label: "Other",                     docs: [] }
    ],
    registrar: [
        { category: "College Graduates" },
        { label: "Transcript of Records (TOR)",     docs: ["Valid ID", "Request Form (PAF)", "Graduating Clearance"] },
        { label: "Diploma / Authentication",         docs: ["Valid ID", "Claim Stub", "Graduating Clearance"] },
        { label: "Certificate of Graduation",        docs: ["Valid ID", "Request Form (PAF)", "Graduating Clearance"] },

        { category: "SHS Graduates" },
        { label: "Form 137 / 138",                  docs: ["Valid ID", "Request Form (PAF)", "Graduating Clearance"] },
        { label: "Diploma",                          docs: ["Valid ID", "Claim Stub", "Graduating Clearance"] },
        { label: "CTC of Report Card",               docs: ["Valid ID", "Request Form (PAF)", "Graduating Clearance"] },

        { category: "Ongoing Students" },
        { label: "Certificate of Enrollment",        docs: ["School ID or RAF", "Request Form (PAF)"] },
        { label: "CTC of Report Card",               docs: ["School ID or RAF", "Request Form (PAF)"] },
        { label: "Statement of Account",             docs: ["School ID or RAF"] },
        { label: "Registration Form",                docs: ["School ID", "Official Receipt of Payment"] },

        { category: "Undergraduate (Transferees)" },
        { label: "Transcript of Records (TOR)",      docs: ["Valid ID", "Request Form (PAF)", "Exit Clearance", "Surrender School ID"] },
        { label: "Copy of Grades",                   docs: ["Valid ID", "Request Form (PAF)", "Exit Clearance", "Surrender School ID"] },

        { category: "Other" },
        { label: "Other",                            docs: ["Valid ID or School ID", "Request Form (PAF)"] }
    ],
};