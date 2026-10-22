/* Self-assessment quiz.
 *
 * Reads assets/quiz-data.json, which scripts/build_quiz_data.py compiles from
 * question_banks/public/ only. The exam banks live outside site/ and never reach the
 * browser — do not add a code path that loads them.
 *
 * Deep links, all of which start a round immediately:
 *   ?bank=03              one chapter — what every chapter page links
 *   ?banks=03,04,08       several chapters
 *   ?test=1               everything the first written test covers
 * plus &n=15&mode=study. quiz.html, where the quiz used to live, redirects here
 * keeping the query.
 */
(function () {
  "use strict";

  var DATA_URL = "assets/quiz-data.json";
  var state = {
    banks: [], groups: [], selected: {},
    questions: [], answers: [], index: 0, mode: "study"
  };

  var el = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------------ helpers

  /** Fisher-Yates, on a copy. */
  function shuffled(items) {
    var out = items.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  /** Set text, then let KaTeX pick up any $…$ inside it. Questions are authored with
   *  LaTeX, so this runs on every string that comes from a bank. */
  function setMath(node, text) {
    node.textContent = text;
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(node, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
          ],
          throwOnError: false
        });
      } catch (err) { /* leave the plain text in place */ }
    }
  }

  function show(name) {
    ["setup", "quiz", "results"].forEach(function (screen) {
      el("quiz-" + screen).hidden = screen !== name;
    });
  }

  // ------------------------------------------------------------------- setup

  function selectedBanks() {
    return state.banks.filter(function (bank) { return state.selected[bank.id]; });
  }

  /** Tick exactly these chapter ids; pass null for every chapter. */
  function select(ids) {
    state.selected = {};
    state.banks.forEach(function (bank) {
      state.selected[bank.id] = ids === null || ids.indexOf(bank.id) !== -1;
    });
    syncPicker();
  }

  /** Push the state onto the checkboxes, and refresh what depends on it. */
  function syncPicker() {
    Array.prototype.forEach.call(
      el("quiz-chapters").querySelectorAll("input[type=checkbox]"),
      function (box) { box.checked = !!state.selected[box.value]; });

    var chosen = selectedBanks();
    var questions = chosen.reduce(function (n, b) { return n + b.questionCount; }, 0);
    var summary = el("quiz-selected");

    if (!chosen.length) {
      summary.textContent = "Tick at least one chapter.";
    } else {
      var label = chosen.length === state.banks.length
        ? "All " + chosen.length + " chapters"
        : chosen.length + (chosen.length === 1 ? " chapter" : " chapters");
      summary.textContent = label + " · " + questions + " questions to draw from";
    }
    el("quiz-start").disabled = !chosen.length;

    // A preset is "on" when the ticks are exactly its chapters.
    Array.prototype.forEach.call(
      el("quiz-presets").querySelectorAll("button"),
      function (button) {
        var want = button.dataset.stems ? button.dataset.stems.split(",") : null;
        var ids = want === null
          ? state.banks.map(function (b) { return b.id; })
          : state.banks.filter(function (b) { return want.indexOf(b.stem) !== -1; })
              .map(function (b) { return b.id; });
        var same = ids.length === chosen.length && ids.every(function (id) {
          return state.selected[id];
        });
        button.classList.toggle("is-active", same && chosen.length > 0);
        button.setAttribute("aria-pressed", String(same && chosen.length > 0));
      });
  }

  function preset(label, hint, stems) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "quiz-preset";
    if (stems) button.dataset.stems = stems.join(",");
    var name = document.createElement("span");
    name.className = "quiz-preset-name";
    name.textContent = label;
    button.appendChild(name);
    if (hint) {
      var sub = document.createElement("span");
      sub.className = "quiz-preset-hint";
      sub.textContent = hint;
      button.appendChild(sub);
    }
    button.addEventListener("click", function () {
      select(stems === null ? null : state.banks
        .filter(function (b) { return stems.indexOf(b.stem) !== -1; })
        .map(function (b) { return b.id; }));
    });
    return button;
  }

  function buildScopePicker() {
    var presets = el("quiz-presets");
    presets.appendChild(preset("Everything", state.banks.length + " chapters", null));
    state.groups.forEach(function (group) {
      var covered = state.banks.filter(function (b) {
        return group.stems.indexOf(b.stem) !== -1;
      });
      presets.appendChild(preset(group.title, covered.length + " chapters",
                                 group.stems));
    });

    // The chapters are listed under the same two headings as the presets, in the order
    // the course teaches them. Grouping them by the `section` of their bank instead
    // would scatter them: those sections are the old three-way split, which puts
    // chapters 8 to 10 after 11 and 12.
    var holder = el("quiz-chapters");
    var placed = {};
    var buckets = state.groups.map(function (group) {
      return {
        name: group.title,
        banks: group.stems.map(function (stem) {
          return state.banks.filter(function (b) { return b.stem === stem; })[0];
        }).filter(function (b) {
          if (!b) return false;
          placed[b.id] = true;
          return true;
        })
      };
    });
    var rest = state.banks.filter(function (b) { return !placed[b.id]; });
    if (rest.length) buckets.push({ name: "Other chapters", banks: rest });

    buckets.forEach(function (bucket) {
      if (!bucket.banks.length) return;
      var group = document.createElement("div");
      group.className = "quiz-chapter-group";
      var heading = document.createElement("p");
      heading.className = "quiz-chapter-group-name";
      heading.textContent = bucket.name;
      group.appendChild(heading);
      var list = document.createElement("div");
      list.className = "quiz-chapter-list";
      group.appendChild(list);
      holder.appendChild(group);
      bucket.banks.forEach(function (bank) { list.appendChild(chapterBox(bank)); });
    });

    select(null);
  }

  function chapterBox(bank) {
      var id = "quiz-ch-" + bank.id;
      var label = document.createElement("label");
      label.className = "quiz-pick";
      label.htmlFor = id;

      var box = document.createElement("input");
      box.type = "checkbox";
      box.id = id;
      box.value = bank.id;
      box.addEventListener("change", function () {
        state.selected[bank.id] = box.checked;
        syncPicker();
      });
      label.appendChild(box);

      var text = document.createElement("span");
      text.className = "quiz-pick-name";
      text.textContent = bank.title;
      label.appendChild(text);

      var count = document.createElement("span");
      count.className = "quiz-pick-count";
      count.textContent = bank.questionCount;
      label.appendChild(count);

      return label;
  }

  /** Return a copy of `question` with its five answers in a random order.
   *
   *  The banks were written with the correct answer first far more often than not
   *  (about two thirds of them), so serving the options in file order would teach
   *  students to pick A. Shuffling here also means a second attempt at the same
   *  question is not answered from memory of the position.
   */
  function withShuffledOptions(question) {
    var order = shuffled(question.options.map(function (_, i) { return i; }));
    return Object.assign({}, question, {
      options: order.map(function (i) { return question.options[i]; }),
      comments: order.map(function (i) { return question.comments[i]; }),
      correctIndex: order.indexOf(question.correctIndex)
    });
  }

  function pool() {
    return selectedBanks().reduce(function (acc, bank) {
      return acc.concat(bank.questions.map(function (q) {
        return Object.assign({}, q, { bank: bank });
      }));
    }, []);
  }

  function start() {
    var chosen = shuffled(pool());
    var wanted = el("quiz-count").value;
    if (wanted !== "all") chosen = chosen.slice(0, parseInt(wanted, 10));
    if (!chosen.length) return;
    chosen = chosen.map(withShuffledOptions);

    state.questions = chosen;
    state.answers = new Array(chosen.length).fill(null);
    state.index = 0;
    state.mode = el("quiz-mode").value;
    show("quiz");
    renderQuestion();
  }

  // -------------------------------------------------------------- the question

  function renderQuestion() {
    var question = state.questions[state.index];
    var answered = state.answers[state.index];

    el("quiz-progress").textContent =
      "Question " + (state.index + 1) + " of " + state.questions.length;
    el("quiz-progress-bar").style.width =
      (100 * state.index / state.questions.length) + "%";
    el("quiz-chapter").textContent = question.bank.title;

    setMath(el("quiz-question"), question.question);

    var list = el("quiz-options");
    list.textContent = "";
    question.options.forEach(function (text, i) {
      var item = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.setAttribute("aria-pressed", "false");

      var label = document.createElement("span");
      label.className = "quiz-option-key";
      label.textContent = "ABCDE".charAt(i);
      button.appendChild(label);

      var body = document.createElement("span");
      body.className = "quiz-option-text";
      setMath(body, text);
      button.appendChild(body);

      button.addEventListener("click", function () { choose(i); });
      item.appendChild(button);
      list.appendChild(item);
    });

    el("quiz-feedback").hidden = true;
    el("quiz-next").textContent =
      state.index === state.questions.length - 1 ? "Finish" : "Next";
    el("quiz-next").disabled = answered === null;
    el("quiz-back").disabled = state.index === 0;

    if (answered !== null) markAnswered(answered);
  }

  function optionButtons() {
    return Array.prototype.slice.call(
      el("quiz-options").querySelectorAll(".quiz-option"));
  }

  function choose(i) {
    // In study mode an answer is final, so the feedback cannot be gamed.
    if (state.mode === "study" && state.answers[state.index] !== null) return;
    state.answers[state.index] = i;
    markAnswered(i);
    el("quiz-next").disabled = false;
  }

  function markAnswered(chosenIndex) {
    var question = state.questions[state.index];
    optionButtons().forEach(function (button, i) {
      button.setAttribute("aria-pressed", String(i === chosenIndex));
      button.classList.toggle("is-chosen", i === chosenIndex);
      if (state.mode === "study") {
        button.classList.toggle("is-correct", i === question.correctIndex);
        button.classList.toggle("is-wrong",
          i === chosenIndex && i !== question.correctIndex);
        button.disabled = true;
      }
    });

    if (state.mode !== "study") return;

    var box = el("quiz-feedback");
    box.hidden = false;
    box.className = "quiz-feedback " +
      (chosenIndex === question.correctIndex ? "is-correct" : "is-wrong");
    box.textContent = "";
    var verdict = document.createElement("strong");
    verdict.textContent = chosenIndex === question.correctIndex
      ? "Correct" : "Not quite";
    box.appendChild(verdict);
    var comment = document.createElement("p");
    setMath(comment, question.comments[chosenIndex] || "");
    box.appendChild(comment);
  }

  function move(delta) {
    var next = state.index + delta;
    if (next < 0) return;
    if (next >= state.questions.length) return finish();
    state.index = next;
    renderQuestion();
  }

  // ------------------------------------------------------------------ results

  function finish() {
    var right = state.questions.filter(function (question, i) {
      return state.answers[i] === question.correctIndex;
    }).length;
    var total = state.questions.length;

    el("quiz-score").textContent = right + " / " + total;
    el("quiz-score-pct").textContent = Math.round(100 * right / total) + "%";

    var review = el("quiz-review");
    review.textContent = "";
    state.questions.forEach(function (question, i) {
      var chosen = state.answers[i];
      var ok = chosen === question.correctIndex;

      var card = document.createElement("li");
      card.className = "quiz-review-item " + (ok ? "is-correct" : "is-wrong");

      var head = document.createElement("p");
      head.className = "quiz-review-q";
      setMath(head, (i + 1) + ". " + question.question);
      card.appendChild(head);

      var yours = document.createElement("p");
      yours.className = "quiz-review-answer";
      setMath(yours, (ok ? "✓ " : "✗ ") +
        (chosen === null ? "(not answered)" : question.options[chosen]));
      card.appendChild(yours);

      if (!ok) {
        var right_ = document.createElement("p");
        right_.className = "quiz-review-correct";
        setMath(right_, "→ " + question.options[question.correctIndex]);
        card.appendChild(right_);
      }

      var why = document.createElement("p");
      why.className = "quiz-review-comment";
      setMath(why, question.comments[chosen === null ? question.correctIndex : chosen] || "");
      card.appendChild(why);

      if (question.bank.chapterHref) {
        var link = document.createElement("a");
        link.href = question.bank.chapterHref;
        link.className = "quiz-review-link";
        link.textContent = "Read the chapter →";
        card.appendChild(link);
      }
      review.appendChild(card);
    });

    show("results");
    // The quiz is a section of the home page: go back to its top, not the page's.
    var quiz = document.querySelector(".quiz");
    if (quiz) quiz.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0);
  }

  // --------------------------------------------------------------------- boot

  function applyDeepLink() {
    var params = new URLSearchParams(window.location.search);
    var known = function (id) {
      return state.banks.some(function (b) { return b.id === id; });
    };

    var started = false;
    // One chapter: what the button at the top of every chapter page links.
    var bank = params.get("bank");
    var many = params.get("banks");
    var test = params.get("test");
    if (bank && known(bank)) {
      select([bank]);
      started = true;
    } else if (many) {
      var ids = many.split(",").map(function (s) { return s.trim(); }).filter(known);
      if (ids.length) { select(ids); started = true; }
    } else if (test) {
      var group = state.groups[parseInt(test, 10) - 1];
      if (group) {
        select(state.banks
          .filter(function (b) { return group.stems.indexOf(b.stem) !== -1; })
          .map(function (b) { return b.id; }));
        started = true;
      }
    }

    var n = params.get("n");
    if (n && Array.prototype.some.call(el("quiz-count").options,
      function (o) { return o.value === n; })) {
      el("quiz-count").value = n;
    }
    var mode = params.get("mode");
    if (mode === "study" || mode === "exam") el("quiz-mode").value = mode;
    if (started) start();
  }

  function boot() {
    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error(response.status + " " + response.statusText);
        return response.json();
      })
      .then(function (data) {
        state.banks = data.banks || [];
        state.groups = data.groups || [];
        if (!state.banks.length) throw new Error("no question banks in the payload");
        buildScopePicker();
        el("quiz-total").textContent = state.banks.reduce(function (n, b) {
          return n + b.questionCount;
        }, 0);
        el("quiz-loading").hidden = true;
        el("quiz-setup-form").hidden = false;
        applyDeepLink();
      })
      .catch(function (error) {
        el("quiz-loading").textContent =
          "The questions could not be loaded (" + error.message + "). " +
          "Reload the page; if it keeps failing, tell the teacher.";
      });

    el("quiz-start").addEventListener("click", start);
    el("quiz-next").addEventListener("click", function () { move(1); });
    el("quiz-back").addEventListener("click", function () { move(-1); });
    el("quiz-quit").addEventListener("click", function () { show("setup"); });
    el("quiz-again").addEventListener("click", start);
    el("quiz-new").addEventListener("click", function () { show("setup"); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
