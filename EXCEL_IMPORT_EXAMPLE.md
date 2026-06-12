# Excel Import Format Example

## Required Format

Your Excel file must have:
1. **Header Row** (Row 1) - Column names
2. **Data Rows** (Row 2 onwards) - User information

---

## Example 1: Basic Format (Required Columns Only)

| first_name | last_name | email | contact_number | gender |
|------------|-----------|-------|----------------|--------|
| Juan | Dela Cruz | juan@email.com | 09171234567 | Male |
| Maria | Reyes | maria@email.com | 09281234567 | Female |
| Paulo | Fernandez | paulo@email.com | 09391234567 | Male |

---

## Example 2: With Full Name Column (Alternative)

| full_name | email | contact_number | gender |
|-----------|-------|----------------|--------|
| Dela Cruz, Juan | juan@email.com | 09171234567 | Male |
| Reyes, Maria | maria@email.com | 09281234567 | Female |
| Fernandez, Paulo | paulo@email.com | 09391234567 | Male |

**Note:** Format can be "Last Name, First Name" or "First Name Last Name"

---

## Example 3: Complete Format (With Optional Fields)

| first_name | last_name | email | contact_number | gender | lot_owned | street_address | city | province | postal_code |
|------------|-----------|-------|----------------|--------|-----------|----------------|------|----------|-------------|
| Juan | Dela Cruz | juan@email.com | 09171234567 | Male | FA2-1 | 123 Main St | Manila | Metro Manila | 1000 |
| Maria | Reyes | maria@email.com | 09281234567 | Female | HB3-5 | 456 Oak Ave | Quezon City | Metro Manila | 1100 |
| Paulo | Fernandez | paulo@email.com | 09391234567 | Male | | 789 Pine Rd | Makati | Metro Manila | 1200 |

---

## Example 4: With Deceased Records

| first_name | last_name | email | contact_number | gender | lot_owned | deceased_name | deceased_date_of_death | deceased_burial_date |
|------------|-----------|-------|----------------|--------|----------|---------------|------------------------|----------------------|
| Juan | Dela Cruz | juan@email.com | 09171234567 | Male | FA2-1 | Maria Dela Cruz | 2024-01-15 | 2024-01-20 |
| Maria | Reyes | maria@email.com | 09281234567 | Female | HB3-5 | | | |
| Paulo | Fernandez | paulo@email.com | 09391234567 | Male | | | | |

---

## Example 5: Complete Example (All Optional Fields)

| first_name | last_name | middle_name | email | contact_number | gender | lot_owned | street_address | city | province | postal_code | emergency_contact_name | emergency_contact_phone | occupation | deceased_name | deceased_date_of_death |
|------------|-----------|-------------|-------|----------------|--------|----------|----------------|------|----------|-------------|----------------------|------------------------|------------|---------------|------------------------|
| Juan | Dela Cruz | Santos | juan@email.com | 09171234567 | Male | FA2-1 | 123 Main St | Manila | Metro Manila | 1000 | Pedro Dela Cruz | 09181111111 | Engineer | Maria Dela Cruz | 2024-01-15 |
| Maria | Reyes | | maria@email.com | 09281234567 | Female | HB3-5 | 456 Oak Ave | Quezon City | Metro Manila | 1100 | Jose Reyes | 09282222222 | Teacher | | |
| Paulo | Fernandez | | paulo@email.com | 09391234567 | Male | | 789 Pine Rd | Makati | Metro Manila | 1200 | Ana Fernandez | 09383333333 | Doctor | | |

---

## Column Names Reference

### ✅ Required Columns:
- `first_name` (or use `full_name`/`name` instead)
- `last_name` (or parsed from `full_name`)
- `email`
- `contact_number`
- `gender` or `sex_at_birth`

### 📋 Optional Columns (Auto-saved if provided):

**User Info:**
- `username` (auto-generated if not provided)
- `middle_name`
- `user_type` or `role` (default: customer)

**Customer Details:**
- `street_address`
- `city`
- `province`
- `postal_code`
- `country` (default: Philippines)
- `emergency_contact_name`
- `emergency_contact_phone`
- `emergency_contact_relationship`
- `occupation`
- `employer`
- `monthly_income`
- `source_of_funds`
- `notes`

**Lot Ownership:**
- `lot_owned` (format: FA2-1, HB3-5, etc.)

**Deceased Records:**
- `deceased_name` (or `deceased_first_name` + `deceased_last_name`)
- `deceased_date_of_birth`
- `deceased_date_of_death`
- `deceased_burial_date`
- `deceased_cause_of_death`
- `deceased_funeral_home`
- `deceased_status` (BURIED or SCHEDULED)
- `deceased_notes`

---

## Important Notes:

1. **Header Row is REQUIRED** - First row must contain column names
2. **Case-insensitive** - Column names can be uppercase, lowercase, or mixed case
3. **Date Format** - Use YYYY-MM-DD format (e.g., 2024-01-15)
4. **Lot Format** - Use format like FA2-1 (Garden-Sector-Block-Lot)
5. **Contact Number** - Can be with or without +639 prefix
6. **Empty Cells** - Optional fields can be left empty
7. **Username** - Auto-generated as firstname1, firstname2, etc. if not provided

---

## Quick Start Template

Copy this into Excel:

```
first_name	last_name	email	contact_number	gender
Juan	Dela Cruz	juan@email.com	09171234567	Male
Maria	Reyes	maria@email.com	09281234567	Female
```

Save as `.xlsx` or `.xls` and import!

