// TODO: do I need to use an iife to scope variables?
(function () {
  const mqtt = require('mqtt');

  const hostname = "mqtt://raspberrypi.local";
  const client  = mqtt.connect(hostname);


  const TIMERS = {};

  // --------- MQTT listners ---------
  client.on('connect', function () {
    console.log("[Snips Log] Connected to MQTT broker " + hostname);

    client.subscribe('hermes/intent/#');
  });

  client.on('message', function (topic, message) {
    console.log("[Snips Log] Message received: " + topic);

    if (topic === 'hermes/intent/steve1nyc:SetTimer') {
      console.log('[Snips Log] Intent SetTimer identified');
      setTimer(topic, JSON.parse(message));
    } else if (topic === 'hermes/intent/steve1nyc:StopTimer') {
      console.log('[Snips Log] Intent StopTimer identified');
      stopTimer(topic, JSON.parse(message));
    } else if (topic === 'hermes/intent/steve1nyc:ListAllTimers') {
      console.log('[Snips Log] Intent ListAllTimers identified');
      listAllTimers(topic, JSON.parse(message));
    } else if (topic === 'hermes/intent/steve1nyc:StopAllTimers') {
      console.log('[Snips Log] Intent StopAllTimers identified');
      stopAllTimers(topic, JSON.parse(message));
    } else if (topic === 'hermes/intent/steve1nyc:HowMuchTimeLeft') {
      console.log('[Snips Log] Intent HowMuchTimeLeft identified');
      timeLeftForTimer(topic, JSON.parse(message));
    }
  });

  // --------- Helpers ---------
  function clearAllTimers() {
    console.log(`[Snips Log] Deleting all timers`);
    for (const timer in TIMERS) {
      clearTimerByName(timer);
    }
  }

  function clearTimerByName(timer) {
    console.log(`[Snips Log] Deleting timer "${timer}"`);
    clearTimeout(TIMERS[timer]);
    delete TIMERS[timer]
  }

  function parseSlots(slots) {
    return slots.reduce((acc, curr) => {
      acc[curr.slotName] = {
        rawValue: curr.rawValue,
        value: curr.value,
      };
      return acc;
    }, {});
  }

  function getTimeInMSFromDuration(duration) {
    return duration.seconds * 1000 +
      duration.minutes * 60 * 1000 +
      duration.hours * 60 * 60 * 1000;
  }

  function getTimerName(slots) {
    if (slots.timer_name !== undefined) {
      return slots.timer_name.rawValue;
    } else if (slots.timer_duration !== undefined) {
      return slots.timer_duration.rawValue;
    }
  }

  // --------- Intent Hanlders ---------
  function setTimer(topic, payload) {
    const slots = parseSlots(payload.slots);
    const timerDuration = slots.timer_duration;
    const timerDurationMS = getTimeInMSFromDuration(timerDuration.value);

    console.log(`[Snips Log] Slots detected: ${JSON.stringify(slots)}`);

    // If the user gave a name for the timer, use that. If not, use the duration given
    const timerName = getTimerName(slots);

    console.log('timerName', timerName)
    console.log('timerDurationMS', timerDurationMS)

    //TODO: check if timer exists before creating it. If it does exist,
    // don't create a new one, but inform the user

    // Create a new timer and add it to TIMERS object
    const newTimer = setTimeout(() => {
      console.log(`[Snips Log] Timer done: ${TIMERS}`);

      // Notify user that timer is done
      client.publish('hermes/dialogueManager/startSession', JSON.stringify({
        init: {
          type: 'notification',
          text: `${timerName} is done.`,
        },
      }));

      delete TIMERS[timerName];

      console.log('TIMERS', TIMERS);
    }, timerDurationMS);

    TIMERS[timerName] = {
      timer: newTimer,
      startTime: Date.now(),
    }

    console.log('TIMERS', TIMERS);

    console.log(`[Snips Log] Timer started: ${timerName}`);

    // End the session and notify user of new timer being set successfully
    client.publish('hermes/dialogueManager/endSession', JSON.stringify({
      sessionId: payload.sessionId,
      text: `Timer with the name ${timerName} has been set for ${timerDuration.rawValue}`,
    }));
  }

  function listAllTimers(topic, payload) {
    const timers = Object.keys(TIMERS);
    let response = '';

    if (timers.length === 0) {
      response = `There are currently no timers set`;
    } else if (timers.length === 1) {
      response = `There is currently one timer set. ${timers[0]}`;
    } else {
      response = `There are currently ${timers.length} timers set. ${timers.join(' ')}`;
    }

    // End the session and notify user of all current timers
    client.publish('hermes/dialogueManager/endSession', JSON.stringify({
      sessionId: payload.sessionId,
      text: response,
    }));
  }

  function timeLeftForTimer(topic, payload) {
    const slots = parseSlots(payload.slots);
    const timer = slots.timer_name.rawValue;

    console.log('timer', timer)

    if (TIMERS[timer] !== undefined) {
      const startTime = TIMERS[timer].startTime;
      const timeLeft = Date.now() - startTime;

      console.log('timeleft', timeLeft);

      // End the session and notify user of time left on timer
      client.publish('hermes/dialogueManager/endSession', JSON.stringify({
        sessionId: payload.sessionId,
        text: `${timer} has ${timeLeft} milliseconds left`,
      }));
    } else {
      // End the session and notify user of that the requested timer doesn't exist
      client.publish('hermes/dialogueManager/endSession', JSON.stringify({
        sessionId: payload.sessionId,
        text: `Sorry, but I don't seem to have a timer named ${timer}.`,
      }));
    }

  }

  function stopTimer(topic, payload) {
    const slots = parseSlots(payload.slots);
    const timer = slots.timer_name;

    clearTimerByName(timer);

    // End the session and notify user of timer deletion
    client.publish('hermes/dialogueManager/endSession', JSON.stringify({
      sessionId: payload.sessionId,
      text: `${timer} has been deleted.`,
    }));
  }

  function stopAllTimers(topic, payload) {
    Object.keys(TIMERS).forEach(timer => {
      clearTimerByName(timer);
    });

    // End the session and notify user of timer deletion
    client.publish('hermes/dialogueManager/endSession', JSON.stringify({
      sessionId: payload.sessionId,
      text: `All timers have been stopped.`,
    }));
  }

})();
