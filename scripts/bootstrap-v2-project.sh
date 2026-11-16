#!/usr/bin/env bash
# Create native V2 GitHub Project with authenticated project-scope gh CLI.
# Safe by default: never deletes existing Projects or issues.
set -euo pipefail
OWNER="darkmatter2222"
REPO="$OWNER/Rustwake"
TITLE="Rustwake V2 — Living Industrial World"
command -v gh >/dev/null || { echo "Install GitHub CLI"; exit 2; }
gh auth status >/dev/null || { echo "gh auth login; gh auth refresh -s project"; exit 2; }
echo "Looking for existing V2 project"
PROJECT_NUMBER="$(gh project list --owner "$OWNER" --format json -q '.projects[] | select(.title=="Rustwake V2 — Living Industrial World") | .number' 2>/dev/null | head -n 1 || true)"
if [[ -z "$PROJECT_NUMBER" ]]; then
  PROJECT_NUMBER="$(gh project create --owner "$OWNER" --title "$TITLE" --format json -q '.number')"
  [[ "$PROJECT_NUMBER" =~ ^[0-9]+$ ]] || { echo "Missing project number"; exit 1; }
else echo "Reusing Project $PROJECT_NUMBER"; fi
gh project link "$PROJECT_NUMBER" --owner "$OWNER" -R "$REPO" || true
gh project edit "$PROJECT_NUMBER" --owner "$OWNER" --description "V2 isometric 3D industrial sandbox. Master 253; phase epics 254-259; tasks 260-305; reviewed PR to main through CI/CD." --visibility PUBLIC
for n in $(seq 253 305); do
  gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "https://github.com/$REPO/issues/$n" >/dev/null ||
    { echo "Failed adding #$n: inspect scope and rate limit"; exit 1; }
done
echo "NEW PROJECT: https://github.com/users/$OWNER/projects/$PROJECT_NUMBER"
echo "Old Projects remain until this one is verified. Optional explicit deletion afterward:"
echo "  gh project delete 1 --owner $OWNER"
echo "  gh project delete 2 --owner $OWNER"
