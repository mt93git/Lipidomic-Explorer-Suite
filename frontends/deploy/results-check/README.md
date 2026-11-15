# Admin results check (hourly)

The "No results TXT N days after acquisition" email (Notifications page) is sent by a check that claims the due orders
and emails each one once. Admin runs it when lab staff open the Pipeline; this timer runs it every hour too, so a quiet
week still sends it. It calls `POST <ADMIN_URL>/api/cron/results-missing` with `Authorization: Bearer <ADMIN_CRON_SECRET>`.
Admin answers 404 while `ADMIN_CRON_SECRET` is not set in its environment, 401 with a wrong secret, and otherwise
`{"claimed": n, "sent": n, "retry": n}`. An order whose email failed is claimed again by a later run (after 15 minutes),
so nothing is lost when Resend or the server is down; two servers never email the same order at the same time.

Example only: nothing installs it. To install for one environment (as the user that runs the services):

```bash
openssl rand -hex 32                      # put it in Admin's env file as ADMIN_CRON_SECRET, restart Admin
mkdir -p ~/.config/admin-results-check ~/.config/systemd/user
cp env.example ~/.config/admin-results-check/staging.env && chmod 600 ~/.config/admin-results-check/staging.env   # fill in
cp admin-results-check@.service admin-results-check@.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user start admin-results-check@staging.service && journalctl --user -u admin-results-check@staging -n 5
systemctl --user enable --now admin-results-check@staging.timer
```
