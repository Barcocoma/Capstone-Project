# Simplified Excel Import Format

## Required Columns (3 lang!)

| first_name | last_name | lot_owned |
|------------|-----------|-----------|
| Juan | Dela Cruz | FA2-1 |
| Maria | Reyes | HB3-5 |
| Paulo | Fernandez | JA3-2 |

---

## Complete Example

| first_name | last_name | lot_owned | email | contact_number | gender |
|------------|-----------|-----------|-------|----------------|--------|
| Juan | Dela Cruz | FA2-1 | juan@email.com | 09171234567 | Male |
| Maria | Reyes | HB3-5 | maria@email.com | 09281234567 | Female |
| Paulo | Fernandez | JA3-2 | | | |

**Note:** email, contact_number, at gender ay optional lang. Pwede iwanan na blank.

---

## Format ng Lot (lot_owned)

Format: `FA2-1`
- **F** = Garden initial (first letter ng garden name)
- **A** = Sector name
- **2** = Block number
- **1** = Lot number

Examples:
- `FA2-1` = Faith Garden, Sector A, Block 2, Lot 1
- `HB3-5` = Hope Garden, Sector B, Block 3, Lot 5
- `JA3-2` = Joy Garden, Sector A, Block 3, Lot 2

---

## Ano ang Mangyayari Pag Import

1. ✅ **Account auto-create** - User account ay automatic na magagawa
2. ✅ **Username auto-generate** - Format: `firstname1`, `firstname2`, etc. (starting from 1)
3. ✅ **Lot ownership auto-assign** - Lot ay automatic na ma-assign sa user
4. ✅ **Other fields** - Pwede iwanan na blank, pwedeng lagyan later

---

## Example Output

Kung may ganito sa Excel:
```
first_name: Juan
last_name: Dela Cruz
lot_owned: FA2-1
```

Ang mangyayari:
- ✅ Username: `juan1` (auto-generated)
- ✅ Account created: Customer account
- ✅ Lot FA2-1 assigned: Reserved na sa user
- ✅ Other fields: Blank (pwede lagyan later)

---

## Quick Template

Copy this sa Excel:

```
first_name	last_name	lot_owned
Juan	Dela Cruz	FA2-1
Maria	Reyes	HB3-5
Paulo	Fernandez	JA3-2
```

Save as `.xlsx` at import na!

---

## Important Notes

1. **Required lang:** first_name, last_name, lot_owned
2. **Username:** Auto-generated (firstname1, firstname2, etc.)
3. **Account:** Auto-created pag may lot_owned
4. **Lot format:** FA2-1 (Garden-Sector-Block-Lot)
5. **Other fields:** Optional lang, pwede blank

---

## Column Name Variations Supported

- `first_name` o `First Name` o `FirstName`
- `last_name` o `Last Name` o `LastName`
- `full_name` o `Full Name` o `Name` (pwede rin)
- `lot_owned` o `Lot Owned` o `lot_owned` o `Lot`

---

**Simple lang! Import mo na ang Excel file mo!** 🎉

