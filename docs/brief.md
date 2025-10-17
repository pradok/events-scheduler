Write a simple node.js application to send a happy birthday message to users on their
birthday at exactly 9am on their local time. For example, if one user is in New York and the second user is in Melbourne, they should be getting a birthday message in their own timezone.

### Requirements

1. Typescript
2. Simple API to create or delete users only:
POST /user
DELETE /user

3. User has a first name and last name, birthday date and location (locations could
be in any format of your choice)

4. The system needs to send the following message at 9am on users’ local time via
call to request bin endpoint (or a similar service): “Hey, {full_name} it’s your
birthday”

5. The system needs to be able to recover and send all unsent messages if the
service was down for a period of time (say a day).

6. You may use any database technology you’d like, and you are allowed to take
advantage of the database’s internal mechanisms.

7. It is encouraged to build your application on AWS stack, you may use serverless
offline, localstack or something else. However a plain node.js application is also
okay.

8. You may use 3rd party libs such as express.js, moment.js, ORM etc to save
development time.

### Things to consider

1. Make sure your code is scalable, has a good level of abstraction and can be
extended easily for future use. For example, in the future we may want to add a
happy anniversary message as well or attach a completely different process.

2. Make sure your code is tested and testable

3. Be mindful of race conditions, duplicate messages are unacceptable

4. Think about scalability, will the system be able to handle thousands of birthdays a day?

### Bonus

For extra brownie points, add PUT /user for the user to edit their details. Make
sure the birthday message will still be delivered on the correct day.