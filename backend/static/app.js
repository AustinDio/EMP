const { createApp } = Vue;

createApp({
    data() {
        return {
            user: null,
            authMode: "login",
            activeSection: "dashboard",

            loading: false,
            saving: false,
            errorMessage: "",
            successMessage: "",

            authForm: {
                username: "",
                email: "",
                password: "",
                name: ""
            },

            courses: [],
            examinations: [],
            rubrics: [],
            slots: [],
            records: [],

            courseOptions: [],
            examinationOptions: [],
            examinerOptions: [],

            courseSearch: "",
            examinationSearch: "",

            editingCourseId: null,
            editingExaminationId: null,
            editingRubricId: null,
            editingSlotId: null,

            selectedRubricExamId: "",
            selectedSlotExamId: "",

            courseForm: {
                course_code: "",
                course_name: "",
                description: ""
            },

            examinationForm: {
                course_id: "",
                name: "",
                exam_type: "Viva",
                duration: 30,
                maximum_marks: 100,
                slot_creation_start: "",
                slot_creation_end: "",
                booking_start: "",
                booking_end: "",
                instructions: "",
                status: "Draft"
            },

            rubricForm: {
                criterion_name: "",
                maximum_marks: 10,
                weightage: 0,
                description: ""
            },

            slotForm: {
                examination_id: "",
                examiner_id: "",
                exam_date: "",
                start_time: "",
                end_time: "",
                capacity: 1,
                status: "Available",
                meeting_link: ""
            },

            recordSections: {
                users: {
                    title: "User Management",
                    endpoint: "/api/users",
                    key: "users"
                },
                availability: {
                    title: "Examiner Availability",
                    endpoint: "/api/availability",
                    key: "availability"
                },
                bookings: {
                    title: "Bookings",
                    endpoint: "/api/bookings",
                    key: "bookings"
                },
                evaluations: {
                    title: "Evaluations",
                    endpoint: "/api/evaluations",
                    key: "evaluations"
                },
                results: {
                    title: "Results",
                    endpoint: "/api/results/my-results",
                    key: "results"
                }
            }
        };
    },

    computed: {
        isAdmin() {
            return this.user?.role?.toLowerCase() === "admin";
        },

        isExaminer() {
            return this.user?.role?.toLowerCase() === "examiner";
        },

        isStudent() {
            return this.user?.role?.toLowerCase() === "student";
        },

        pageTitle() {
            const titles = {
                dashboard: "Dashboard",
                courses: "Course Management",
                examinations: "Examination Management",
                rubrics: "Rubric Management",
                slots: "Examination Slot Management",
                users: "User Management",
                availability: "Examiner Availability",
                bookings: "Bookings",
                evaluations: "Evaluations",
                results: "Results"
            };

            return titles[this.activeSection] || "Examination Management Portal";
        }
    },

    methods: {
        async api(url, options = {}) {
            const config = {
                credentials: "same-origin",
                ...options,
                headers: {
                    ...(options.body ? { "Content-Type": "application/json" } : {}),
                    ...(options.headers || {})
                }
            };

            const response = await fetch(url, config);

            let data = {};

            try {
                data = await response.json();
            } catch {
                data = {};
            }

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    data.error ||
                    data.msg ||
                    `Request failed with status ${response.status}`
                );
            }

            return data;
        },

        getList(data, key) {
            if (Array.isArray(data)) {
                return data;
            }

            if (Array.isArray(data?.[key])) {
                return data[key];
            }

            if (Array.isArray(data?.items)) {
                return data.items;
            }

            return [];
        },

        clearMessages() {
            this.errorMessage = "";
            this.successMessage = "";
        },

        showError(error) {
            this.errorMessage = error?.message || "Something went wrong.";
            this.successMessage = "";
        },

        showSuccess(message) {
            this.successMessage = message;
            this.errorMessage = "";
        },

        async loadCurrentUser() {
            try {
                const data = await this.api("/api/auth/me");

                this.user = data.user || data;

                if (this.user && this.user.role) {
                    this.activeSection = "dashboard";
                } else {
                    this.user = null;
                }
            } catch {
                this.user = null;
            }
        },

        async submitAuth() {
            this.clearMessages();
            this.saving = true;

            try {
                if (this.authMode === "register") {
                    const payload = {
                        username: this.authForm.username,
                        email: this.authForm.email,
                        password: this.authForm.password,
                        name: this.authForm.name
                    };

                    await this.api("/api/auth/register", {
                        method: "POST",
                        body: JSON.stringify(payload)
                    });

                    this.authMode = "login";
                    this.authForm.password = "";

                    this.showSuccess(
                        "Registration successful. Sign in using your account."
                    );
                } else {
                    const payload = {
                        username: this.authForm.username,
                        password: this.authForm.password
                    };

                    const data = await this.api("/api/auth/login", {
                        method: "POST",
                        body: JSON.stringify(payload)
                    });

                    this.user = data.user || null;

                    if (!this.user) {
                        await this.loadCurrentUser();
                    }

                    if (!this.user) {
                        throw new Error(
                            "Login succeeded, but the current user could not be loaded."
                        );
                    }

                    this.activeSection = "dashboard";
                    this.showSuccess("Login successful.");

                    await this.loadDashboardData();
                }
            } catch (error) {
                this.showError(error);
            } finally {
                this.saving = false;
            }
        },

        async logout() {
            this.clearMessages();

            try {
                await this.api("/api/auth/logout", {
                    method: "POST"
                });
            } catch (error) {
                this.showError(error);
                return;
            }

            this.user = null;
            this.activeSection = "dashboard";

            this.courses = [];
            this.examinations = [];
            this.rubrics = [];
            this.slots = [];
            this.records = [];

            this.authForm.password = "";
            this.showSuccess("You have been logged out.");
        },

        async loadDashboardData() {
            if (!this.user) {
                return;
            }

            if (this.isAdmin) {
                await Promise.allSettled([
                    this.loadCourses(),
                    this.loadExaminations(),
                    this.loadUsersForDropdown()
                ]);
            } else if (this.isExaminer) {
                await this.loadRecords("availability");
            } else if (this.isStudent) {
                await Promise.allSettled([
                    this.loadRecords("bookings"),
                    this.loadRecords("results")
                ]);
            }
        },

        async openSection(section) {
            this.clearMessages();
            this.activeSection = section;

            try {
                switch (section) {
                    case "courses":
                        await this.loadCourses();
                        break;

                    case "examinations":
                        await Promise.all([
                            this.loadExaminations(),
                            this.loadCourseOptions()
                        ]);
                        break;

                    case "rubrics":
                        await this.loadExaminationOptions();

                        if (this.selectedRubricExamId) {
                            await this.loadRubrics();
                        } else {
                            this.rubrics = [];
                        }
                        break;

                    case "slots":
                        await Promise.all([
                            this.loadSlots(),
                            this.loadExaminationOptions(),
                            this.loadUsersForDropdown()
                        ]);
                        break;

                    case "users":
                        await this.loadRecords("users");
                        break;

                    case "availability":
                        await this.loadRecords("availability");
                        break;

                    case "bookings":
                        await this.loadRecords("bookings");
                        break;

                    case "evaluations":
                        await this.loadRecords("evaluations");
                        break;

                    case "results":
                        await this.loadRecords("results");
                        break;
                }
            } catch (error) {
                this.showError(error);
            }
        },

        // --------------------------------------------------
        // COURSE MANAGEMENT
        // --------------------------------------------------

        resetCourseForm() {
            this.editingCourseId = null;

            this.courseForm = {
                course_code: "",
                course_name: "",
                description: ""
            };
        },

        async loadCourses() {
            const query = this.courseSearch.trim();

            const url = query
                ? `/api/courses?search=${encodeURIComponent(query)}`
                : "/api/courses";

            const data = await this.api(url);

            this.courses = this.getList(data, "courses");
        },

        editCourse(course) {
            this.editingCourseId = course.id;

            this.courseForm = {
                course_code: course.course_code || "",
                course_name: course.course_name || "",
                description: course.description || ""
            };

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        },

        async saveCourse() {
            this.clearMessages();
            this.saving = true;

            try {
                const editing = this.editingCourseId !== null;

                const url = editing
                    ? `/api/courses/${this.editingCourseId}`
                    : "/api/courses";

                await this.api(url, {
                    method: editing ? "PUT" : "POST",
                    body: JSON.stringify(this.courseForm)
                });

                this.resetCourseForm();
                await this.loadCourses();

                this.showSuccess(
                    editing
                        ? "Course updated successfully."
                        : "Course created successfully."
                );
            } catch (error) {
                this.showError(error);
            } finally {
                this.saving = false;
            }
        },

        async deleteCourse(course) {
            if (!confirm(`Delete course "${course.course_name}"?`)) {
                return;
            }

            this.clearMessages();

            try {
                await this.api(`/api/courses/${course.id}`, {
                    method: "DELETE"
                });

                await this.loadCourses();
                this.showSuccess("Course deleted successfully.");
            } catch (error) {
                this.showError(error);
            }
        },

        async loadCourseOptions() {
            const data = await this.api("/api/courses");

            this.courseOptions = this.getList(data, "courses");
        },

        // --------------------------------------------------
        // EXAMINATION MANAGEMENT
        // --------------------------------------------------

        resetExaminationForm() {
            this.editingExaminationId = null;

            this.examinationForm = {
                course_id: "",
                name: "",
                exam_type: "Viva",
                duration: 30,
                maximum_marks: 100,
                slot_creation_start: "",
                slot_creation_end: "",
                booking_start: "",
                booking_end: "",
                instructions: "",
                status: "Draft"
            };
        },

        async loadExaminations() {
            const query = this.examinationSearch.trim();

            const url = query
                ? `/api/examinations?search=${encodeURIComponent(query)}`
                : "/api/examinations";

            const data = await this.api(url);

            this.examinations = this.getList(data, "examinations");
        },

        editExamination(exam) {
            this.editingExaminationId = exam.id;

            this.examinationForm = {
                course_id: String(exam.course_id ?? ""),
                name: exam.name || "",
                exam_type: exam.exam_type || "Viva",
                duration: exam.duration ?? 30,
                maximum_marks: exam.maximum_marks ?? 100,
                slot_creation_start: this.toDateTimeLocal(
                    exam.slot_creation_start
                ),
                slot_creation_end: this.toDateTimeLocal(
                    exam.slot_creation_end
                ),
                booking_start: this.toDateTimeLocal(
                    exam.booking_start
                ),
                booking_end: this.toDateTimeLocal(
                    exam.booking_end
                ),
                instructions: exam.instructions || "",
                status: exam.status || "Draft"
            };

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        },

        toDateTimeLocal(value) {
            if (!value) {
                return "";
            }

            return String(value).replace(" ", "T").slice(0, 16);
        },

        async saveExamination() {
            this.clearMessages();
            this.saving = true;

            try {
                const editing = this.editingExaminationId !== null;

                const payload = {
                    ...this.examinationForm,
                    course_id: Number(this.examinationForm.course_id),
                    duration: Number(this.examinationForm.duration),
                    maximum_marks: Number(
                        this.examinationForm.maximum_marks
                    )
                };

                for (const field of [
                    "slot_creation_start",
                    "slot_creation_end",
                    "booking_start",
                    "booking_end"
                ]) {
                    if (!payload[field]) {
                        delete payload[field];
                    }
                }

                const url = editing
                    ? `/api/examinations/${this.editingExaminationId}`
                    : "/api/examinations";

                await this.api(url, {
                    method: editing ? "PUT" : "POST",
                    body: JSON.stringify(payload)
                });

                this.resetExaminationForm();
                await this.loadExaminations();

                this.showSuccess(
                    editing
                        ? "Examination updated successfully."
                        : "Examination created successfully."
                );
            } catch (error) {
                this.showError(error);
            } finally {
                this.saving = false;
            }
        },

        async deleteExamination(exam) {
            if (!confirm(`Delete examination "${exam.name}"?`)) {
                return;
            }

            this.clearMessages();

            try {
                await this.api(`/api/examinations/${exam.id}`, {
                    method: "DELETE"
                });

                await this.loadExaminations();

                this.showSuccess("Examination deleted successfully.");
            } catch (error) {
                this.showError(error);
            }
        },

        async loadExaminationOptions() {
            const data = await this.api("/api/examinations");

            this.examinationOptions = this.getList(data, "examinations");
        },

        // --------------------------------------------------
        // RUBRIC MANAGEMENT
        // --------------------------------------------------

        resetRubricForm() {
            this.editingRubricId = null;

            this.rubricForm = {
                criterion_name: "",
                maximum_marks: 10,
                weightage: 0,
                description: ""
            };
        },

        async loadRubrics() {
            if (!this.selectedRubricExamId) {
                this.rubrics = [];
                return;
            }

            const data = await this.api(
                `/api/examinations/${this.selectedRubricExamId}/rubrics`
            );

            this.rubrics = this.getList(data, "rubrics");
        },

        editRubric(rubric) {
            this.editingRubricId = rubric.id;

            this.rubricForm = {
                criterion_name: rubric.criterion_name || "",
                maximum_marks: rubric.maximum_marks ?? 10,
                weightage: rubric.weightage ?? 0,
                description: rubric.description || ""
            };

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        },

        async saveRubric() {
            this.clearMessages();

            if (!this.selectedRubricExamId) {
                this.errorMessage = "Select an examination first.";
                return;
            }

            this.saving = true;

            try {
                const editing = this.editingRubricId !== null;

                const payload = {
                    ...this.rubricForm,
                    maximum_marks: Number(this.rubricForm.maximum_marks),
                    weightage: Number(this.rubricForm.weightage)
                };

                const url = editing
                    ? `/api/rubrics/${this.editingRubricId}`
                    : `/api/examinations/${this.selectedRubricExamId}/rubrics`;

                await this.api(url, {
                    method: editing ? "PUT" : "POST",
                    body: JSON.stringify(payload)
                });

                this.resetRubricForm();
                await this.loadRubrics();

                this.showSuccess(
                    editing
                        ? "Rubric criterion updated successfully."
                        : "Rubric criterion added successfully."
                );
            } catch (error) {
                this.showError(error);
            } finally {
                this.saving = false;
            }
        },

        async deleteRubric(rubric) {
            if (
                !confirm(
                    `Delete rubric criterion "${rubric.criterion_name}"?`
                )
            ) {
                return;
            }

            this.clearMessages();

            try {
                await this.api(`/api/rubrics/${rubric.id}`, {
                    method: "DELETE"
                });

                await this.loadRubrics();

                this.showSuccess("Rubric criterion deleted.");
            } catch (error) {
                this.showError(error);
            }
        },

        // --------------------------------------------------
        // SLOT MANAGEMENT
        // --------------------------------------------------

        resetSlotForm() {
            this.editingSlotId = null;

            this.slotForm = {
                examination_id: "",
                examiner_id: "",
                exam_date: "",
                start_time: "",
                end_time: "",
                capacity: 1,
                status: "Available",
                meeting_link: ""
            };
        },

        async loadSlots() {
            const data = await this.api("/api/slots");

            this.slots = this.getList(data, "slots");
        },

        async loadUsersForDropdown() {
            try {
                const data = await this.api("/api/users?role=examiner");

                this.examinerOptions = this.getList(data, "users")
                    .filter(user => {
                        return !user.role ||
                            user.role.toLowerCase() === "examiner";
                    });
            } catch (error) {
                this.examinerOptions = [];
                throw error;
            }
        },

        editSlot(slot) {
            this.editingSlotId = slot.id;

            this.slotForm = {
                examination_id: String(slot.examination_id ?? ""),
                examiner_id: String(slot.examiner_id ?? ""),
                exam_date: slot.exam_date || "",
                start_time: String(slot.start_time || "").slice(0, 5),
                end_time: String(slot.end_time || "").slice(0, 5),
                capacity: slot.capacity ?? 1,
                status: slot.status || "Available",
                meeting_link: slot.meeting_link || ""
            };

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        },

        async saveSlot() {
            this.clearMessages();

            this.saving = true;

            try {
                const editing = this.editingSlotId !== null;

                const payload = {
                    ...this.slotForm,
                    examination_id: Number(this.slotForm.examination_id),
                    examiner_id: Number(this.slotForm.examiner_id),
                    capacity: Number(this.slotForm.capacity)
                };

                const url = editing
                    ? `/api/slots/${this.editingSlotId}`
                    : "/api/slots";

                await this.api(url, {
                    method: editing ? "PUT" : "POST",
                    body: JSON.stringify(payload)
                });

                this.resetSlotForm();
                await this.loadSlots();

                this.showSuccess(
                    editing
                        ? "Examination slot updated."
                        : "Examination slot created."
                );
            } catch (error) {
                this.showError(error);
            } finally {
                this.saving = false;
            }
        },

        async deleteSlot(slot) {
            if (!confirm("Delete this examination slot?")) {
                return;
            }

            this.clearMessages();

            try {
                await this.api(`/api/slots/${slot.id}`, {
                    method: "DELETE"
                });

                await this.loadSlots();

                this.showSuccess("Slot deleted successfully.");
            } catch (error) {
                this.showError(error);
            }
        },

        // --------------------------------------------------
        // OTHER ROLE / RECORD VIEWS
        // --------------------------------------------------

        async loadRecords(section) {
            const config = this.recordSections[section];

            if (!config) {
                return;
            }

            const data = await this.api(config.endpoint);

            this.records = this.getList(data, config.key);
        },

        displayValue(value) {
            if (value === null || value === undefined || value === "") {
                return "—";
            }

            if (typeof value === "object") {
                return JSON.stringify(value);
            }

            return String(value);
        },

        formatDate(value) {
            if (!value) {
                return "—";
            }

            return String(value).replace("T", " ");
        }
    },

    async mounted() {
        await this.loadCurrentUser();

        if (this.user) {
            await this.loadDashboardData();
        }
    },

    template: `
        <div>
            <!-- NAVIGATION -->
            <nav v-if="user" class="navbar navbar-expand-lg navbar-dark portal-navbar">
                <div class="container-fluid">
                    <a
                        class="navbar-brand fw-bold"
                        href="#"
                        @click.prevent="openSection('dashboard')"
                    >
                        Examination Portal
                    </a>

                    <div class="d-flex align-items-center gap-3">
                        <span class="text-white small">
                            {{ user.name || user.username }}
                            ({{ user.role }})
                        </span>

                        <button
                            class="btn btn-outline-light btn-sm"
                            @click="logout"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            <main class="container-fluid py-4">
                <!-- MESSAGES -->
                <div
                    v-if="errorMessage"
                    class="alert alert-danger alert-dismissible"
                    role="alert"
                >
                    {{ errorMessage }}
                    <button
                        class="btn-close"
                        @click="errorMessage = ''"
                    ></button>
                </div>

                <div
                    v-if="successMessage"
                    class="alert alert-success alert-dismissible"
                    role="alert"
                >
                    {{ successMessage }}
                    <button
                        class="btn-close"
                        @click="successMessage = ''"
                    ></button>
                </div>

                <!-- LOGIN / REGISTRATION -->
                <section v-if="!user" class="auth-panel mx-auto">
                    <h2 class="mb-2">Examination Management Portal</h2>

                    <p class="text-muted mb-4">
                        Sign in to access your dashboard.
                    </p>

                    <div class="btn-group w-100 mb-4">
                        <button
                            class="btn"
                            :class="authMode === 'login' ? 'btn-primary' : 'btn-outline-primary'"
                            @click="authMode = 'login'; clearMessages()"
                        >
                            Login
                        </button>

                        <button
                            class="btn"
                            :class="authMode === 'register' ? 'btn-primary' : 'btn-outline-primary'"
                            @click="authMode = 'register'; clearMessages()"
                        >
                            Register
                        </button>
                    </div>

                    <form @submit.prevent="submitAuth">
                        <div
                            v-if="authMode === 'register'"
                            class="mb-3"
                        >
                            <label class="form-label">Full Name</label>
                            <input
                                v-model.trim="authForm.name"
                                class="form-control"
                                required
                            >
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Username</label>
                            <input
                                v-model.trim="authForm.username"
                                class="form-control"
                                autocomplete="username"
                                required
                            >
                        </div>

                        <div
                            v-if="authMode === 'register'"
                            class="mb-3"
                        >
                            <label class="form-label">Email</label>
                            <input
                                v-model.trim="authForm.email"
                                type="email"
                                class="form-control"
                                required
                            >
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Password</label>
                            <input
                                v-model="authForm.password"
                                type="password"
                                class="form-control"
                                autocomplete="current-password"
                                required
                            >
                        </div>

                        <button
                            class="btn btn-primary w-100"
                            type="submit"
                            :disabled="saving"
                        >
                            {{ saving ? 'Please wait...' : (authMode === 'login' ? 'Login' : 'Create Account') }}
                        </button>
                    </form>
                </section>

                <!-- AUTHENTICATED APPLICATION -->
                <div v-else class="row g-4">
                    <!-- SIDEBAR -->
                    <aside class="col-12 col-lg-3 col-xl-2">
                        <div class="card shadow-sm">
                            <div class="card-body">
                                <h6 class="text-muted text-uppercase mb-3">
                                    Navigation
                                </h6>

                                <div class="d-grid gap-2">
                                    <button
                                        class="btn text-start"
                                        :class="activeSection === 'dashboard' ? 'btn-primary' : 'btn-light'"
                                        @click="openSection('dashboard')"
                                    >
                                        Dashboard
                                    </button>

                                    <template v-if="isAdmin">
                                        <button
                                            v-for="item in [
                                                ['courses', 'Courses'],
                                                ['examinations', 'Examinations'],
                                                ['rubrics', 'Rubrics'],
                                                ['slots', 'Examination Slots'],
                                                ['users', 'Users']
                                            ]"
                                            :key="item[0]"
                                            class="btn text-start"
                                            :class="activeSection === item[0] ? 'btn-primary' : 'btn-light'"
                                            @click="openSection(item[0])"
                                        >
                                            {{ item[1] }}
                                        </button>
                                    </template>

                                    <template v-if="isExaminer">
                                        <button
                                            v-for="item in [
                                                ['availability', 'My Availability'],
                                                ['evaluations', 'Evaluations']
                                            ]"
                                            :key="item[0]"
                                            class="btn text-start"
                                            :class="activeSection === item[0] ? 'btn-primary' : 'btn-light'"
                                            @click="openSection(item[0])"
                                        >
                                            {{ item[1] }}
                                        </button>
                                    </template>

                                    <template v-if="isStudent">
                                        <button
                                            v-for="item in [
                                                ['bookings', 'My Bookings'],
                                                ['results', 'My Results']
                                            ]"
                                            :key="item[0]"
                                            class="btn text-start"
                                            :class="activeSection === item[0] ? 'btn-primary' : 'btn-light'"
                                            @click="openSection(item[0])"
                                        >
                                            {{ item[1] }}
                                        </button>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </aside>

                    <!-- MAIN CONTENT -->
                    <section class="col-12 col-lg-9 col-xl-10">
                        <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
                            <div>
                                <h2 class="mb-1">{{ pageTitle }}</h2>
                                <p class="text-muted mb-0">
                                    Welcome, {{ user.name || user.username }}.
                                </p>
                            </div>

                            <button
                                class="btn btn-outline-secondary"
                                @click="openSection(activeSection)"
                            >
                                Refresh
                            </button>
                        </div>

                        <!-- DASHBOARD -->
                        <div v-if="activeSection === 'dashboard'" class="row g-3">
                            <template v-if="isAdmin">
                                <div
                                    v-for="card in [
                                        ['courses', 'Course Management', 'Create and manage courses.'],
                                        ['examinations', 'Examinations', 'Configure examination details and timelines.'],
                                        ['rubrics', 'Rubrics', 'Define assessment criteria and marks.'],
                                        ['slots', 'Examination Slots', 'Schedule examiner slots.'],
                                        ['users', 'User Management', 'View portal users.']
                                    ]"
                                    :key="card[0]"
                                    class="col-12 col-md-6 col-xl-4"
                                >
                                    <div
                                        class="dashboard-card h-100"
                                        role="button"
                                        tabindex="0"
                                        @click="openSection(card[0])"
                                        @keydown.enter="openSection(card[0])"
                                    >
                                        <h5>{{ card[1] }}</h5>
                                        <p class="text-muted mb-0">{{ card[2] }}</p>
                                    </div>
                                </div>
                            </template>

                            <template v-else-if="isExaminer">
                                <div class="col-12 col-md-6">
                                    <div
                                        class="dashboard-card h-100"
                                        role="button"
                                        @click="openSection('availability')"
                                    >
                                        <h5>My Availability</h5>
                                        <p class="text-muted">Manage availability for examination slots.</p>
                                    </div>
                                </div>

                                <div class="col-12 col-md-6">
                                    <div
                                        class="dashboard-card h-100"
                                        role="button"
                                        @click="openSection('evaluations')"
                                    >
                                        <h5>Evaluations</h5>
                                        <p class="text-muted">View assigned examinations.</p>
                                    </div>
                                </div>
                            </template>

                            <template v-else>
                                <div class="col-12 col-md-6">
                                    <div
                                        class="dashboard-card h-100"
                                        role="button"
                                        @click="openSection('bookings')"
                                    >
                                        <h5>My Bookings</h5>
                                        <p class="text-muted">View your examination bookings.</p>
                                    </div>
                                </div>

                                <div class="col-12 col-md-6">
                                    <div
                                        class="dashboard-card h-100"
                                        role="button"
                                        @click="openSection('results')"
                                    >
                                        <h5>My Results</h5>
                                        <p class="text-muted">View published examination results.</p>
                                    </div>
                                </div>
                            </template>
                        </div>

                        <!-- COURSES -->
                        <div v-if="activeSection === 'courses' && isAdmin">
                            <div class="card shadow-sm mb-4">
                                <div class="card-body">
                                    <h5 class="mb-3">
                                        {{ editingCourseId ? 'Edit Course' : 'Create Course' }}
                                    </h5>

                                    <form @submit.prevent="saveCourse">
                                        <div class="row g-3">
                                            <div class="col-md-3">
                                                <label class="form-label">Course Code</label>
                                                <input
                                                    v-model.trim="courseForm.course_code"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Course Name</label>
                                                <input
                                                    v-model.trim="courseForm.course_name"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-5">
                                                <label class="form-label">Description</label>
                                                <input
                                                    v-model.trim="courseForm.description"
                                                    class="form-control"
                                                >
                                            </div>
                                        </div>

                                        <div class="mt-3 d-flex gap-2">
                                            <button
                                                class="btn btn-primary"
                                                type="submit"
                                                :disabled="saving"
                                            >
                                                {{ saving ? 'Saving...' : (editingCourseId ? 'Update Course' : 'Create Course') }}
                                            </button>

                                            <button
                                                v-if="editingCourseId"
                                                class="btn btn-outline-secondary"
                                                type="button"
                                                @click="resetCourseForm"
                                            >
                                                Cancel Edit
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>

                            <div class="card shadow-sm">
                                <div class="card-body">
                                    <div class="d-flex flex-wrap gap-2 justify-content-between mb-3">
                                        <h5>Courses</h5>

                                        <form
                                            class="d-flex gap-2"
                                            @submit.prevent="loadCourses"
                                        >
                                            <input
                                                v-model="courseSearch"
                                                class="form-control"
                                                placeholder="Search courses"
                                            >

                                            <button class="btn btn-outline-primary">
                                                Search
                                            </button>
                                        </form>
                                    </div>

                                    <div class="table-responsive">
                                        <table class="table table-hover align-middle">
                                            <thead>
                                                <tr>
                                                    <th>ID</th>
                                                    <th>Code</th>
                                                    <th>Name</th>
                                                    <th>Description</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                <tr v-for="course in courses" :key="course.id">
                                                    <td>{{ course.id }}</td>
                                                    <td>{{ course.course_code }}</td>
                                                    <td>{{ course.course_name }}</td>
                                                    <td>{{ course.description || '—' }}</td>
                                                    <td>
                                                        <div class="d-flex gap-2">
                                                            <button
                                                                class="btn btn-sm btn-outline-primary"
                                                                @click="editCourse(course)"
                                                            >
                                                                Edit
                                                            </button>

                                                            <button
                                                                class="btn btn-sm btn-outline-danger"
                                                                @click="deleteCourse(course)"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                <tr v-if="courses.length === 0">
                                                    <td colspan="5" class="text-center text-muted">
                                                        No courses found.
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- EXAMINATIONS -->
                        <div v-if="activeSection === 'examinations' && isAdmin">
                            <div class="card shadow-sm mb-4">
                                <div class="card-body">
                                    <h5 class="mb-3">
                                        {{ editingExaminationId ? 'Edit Examination' : 'Create Examination' }}
                                    </h5>

                                    <form @submit.prevent="saveExamination">
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label class="form-label">Course</label>
                                                <select
                                                    v-model="examinationForm.course_id"
                                                    class="form-select"
                                                    required
                                                >
                                                    <option value="">Select course</option>
                                                    <option
                                                        v-for="course in courseOptions"
                                                        :key="course.id"
                                                        :value="String(course.id)"
                                                    >
                                                        {{ course.course_code }} — {{ course.course_name }}
                                                    </option>
                                                </select>
                                            </div>

                                            <div class="col-md-6">
                                                <label class="form-label">Examination Name</label>
                                                <input
                                                    v-model.trim="examinationForm.name"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Exam Type</label>
                                                <select
                                                    v-model="examinationForm.exam_type"
                                                    class="form-select"
                                                    required
                                                >
                                                    <option>Viva</option>
                                                    <option>Practical</option>
                                                    <option>Project Demo</option>
                                                    <option>Assessment</option>
                                                </select>
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Duration (minutes)</label>
                                                <input
                                                    v-model.number="examinationForm.duration"
                                                    type="number"
                                                    min="1"
                                                    max="1440"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Maximum Marks</label>
                                                <input
                                                    v-model.number="examinationForm.maximum_marks"
                                                    type="number"
                                                    min="1"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-6">
                                                <label class="form-label">Slot Creation Starts</label>
                                                <input
                                                    v-model="examinationForm.slot_creation_start"
                                                    type="datetime-local"
                                                    class="form-control"
                                                >
                                            </div>

                                            <div class="col-md-6">
                                                <label class="form-label">Slot Creation Ends</label>
                                                <input
                                                    v-model="examinationForm.slot_creation_end"
                                                    type="datetime-local"
                                                    class="form-control"
                                                >
                                            </div>

                                            <div class="col-md-6">
                                                <label class="form-label">Booking Starts</label>
                                                <input
                                                    v-model="examinationForm.booking_start"
                                                    type="datetime-local"
                                                    class="form-control"
                                                >
                                            </div>

                                            <div class="col-md-6">
                                                <label class="form-label">Booking Ends</label>
                                                <input
                                                    v-model="examinationForm.booking_end"
                                                    type="datetime-local"
                                                    class="form-control"
                                                >
                                            </div>

                                            <div class="col-md-6">
                                                <label class="form-label">Status</label>
                                                <select
                                                    v-model="examinationForm.status"
                                                    class="form-select"
                                                >
                                                    <option>Draft</option>
                                                    <option>Slot Creation</option>
                                                    <option>Booking Open</option>
                                                    <option>Closed</option>
                                                    <option>Completed</option>
                                                </select>
                                            </div>

                                            <div class="col-12">
                                                <label class="form-label">Instructions</label>
                                                <textarea
                                                    v-model.trim="examinationForm.instructions"
                                                    class="form-control"
                                                    rows="3"
                                                ></textarea>
                                            </div>
                                        </div>

                                        <div class="mt-3 d-flex gap-2">
                                            <button
                                                class="btn btn-primary"
                                                :disabled="saving"
                                            >
                                                {{ saving ? 'Saving...' : (editingExaminationId ? 'Update Examination' : 'Create Examination') }}
                                            </button>

                                            <button
                                                v-if="editingExaminationId"
                                                type="button"
                                                class="btn btn-outline-secondary"
                                                @click="resetExaminationForm"
                                            >
                                                Cancel Edit
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>

                            <div class="card shadow-sm">
                                <div class="card-body">
                                    <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
                                        <h5>Examinations</h5>

                                        <form
                                            class="d-flex gap-2"
                                            @submit.prevent="loadExaminations"
                                        >
                                            <input
                                                v-model="examinationSearch"
                                                class="form-control"
                                                placeholder="Search examinations"
                                            >
                                            <button class="btn btn-outline-primary">
                                                Search
                                            </button>
                                        </form>
                                    </div>

                                    <div class="table-responsive">
                                        <table class="table table-hover align-middle">
                                            <thead>
                                                <tr>
                                                    <th>ID</th>
                                                    <th>Name</th>
                                                    <th>Course</th>
                                                    <th>Type</th>
                                                    <th>Duration</th>
                                                    <th>Marks</th>
                                                    <th>Status</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                <tr v-for="exam in examinations" :key="exam.id">
                                                    <td>{{ exam.id }}</td>
                                                    <td>{{ exam.name }}</td>
                                                    <td>{{ exam.course_code || exam.course_name || exam.course_id }}</td>
                                                    <td>{{ exam.exam_type }}</td>
                                                    <td>{{ exam.duration }} min</td>
                                                    <td>{{ exam.maximum_marks }}</td>
                                                    <td>
                                                        <span class="badge text-bg-secondary">
                                                            {{ exam.status }}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div class="d-flex flex-wrap gap-2">
                                                            <button
                                                                class="btn btn-sm btn-outline-primary"
                                                                @click="editExamination(exam)"
                                                            >
                                                                Edit
                                                            </button>

                                                            <button
                                                                class="btn btn-sm btn-outline-danger"
                                                                @click="deleteExamination(exam)"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                <tr v-if="examinations.length === 0">
                                                    <td colspan="8" class="text-center text-muted">
                                                        No examinations found.
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- RUBRICS -->
                        <div v-if="activeSection === 'rubrics' && isAdmin">
                            <div class="card shadow-sm mb-4">
                                <div class="card-body">
                                    <h5 class="mb-3">Select Examination</h5>

                                    <select
                                        v-model="selectedRubricExamId"
                                        class="form-select"
                                        @change="resetRubricForm(); loadRubrics()"
                                    >
                                        <option value="">Select examination</option>
                                        <option
                                            v-for="exam in examinationOptions"
                                            :key="exam.id"
                                            :value="String(exam.id)"
                                        >
                                            {{ exam.name }} — {{ exam.maximum_marks }} marks
                                        </option>
                                    </select>

                                    <p class="form-text">
                                        The total rubric marks cannot exceed the examination's maximum marks.
                                    </p>
                                </div>
                            </div>

                            <div v-if="selectedRubricExamId" class="card shadow-sm mb-4">
                                <div class="card-body">
                                    <h5 class="mb-3">
                                        {{ editingRubricId ? 'Edit Criterion' : 'Add Rubric Criterion' }}
                                    </h5>

                                    <form @submit.prevent="saveRubric">
                                        <div class="row g-3">
                                            <div class="col-md-5">
                                                <label class="form-label">Criterion Name</label>
                                                <input
                                                    v-model.trim="rubricForm.criterion_name"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-3">
                                                <label class="form-label">Maximum Marks</label>
                                                <input
                                                    v-model.number="rubricForm.maximum_marks"
                                                    type="number"
                                                    min="0.01"
                                                    step="any"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Weightage (%)</label>
                                                <input
                                                    v-model.number="rubricForm.weightage"
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="any"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-12">
                                                <label class="form-label">Description</label>
                                                <textarea
                                                    v-model.trim="rubricForm.description"
                                                    class="form-control"
                                                    rows="2"
                                                ></textarea>
                                            </div>
                                        </div>

                                        <div class="mt-3 d-flex gap-2">
                                            <button
                                                class="btn btn-primary"
                                                :disabled="saving"
                                            >
                                                {{ saving ? 'Saving...' : (editingRubricId ? 'Update Criterion' : 'Add Criterion') }}
                                            </button>

                                            <button
                                                v-if="editingRubricId"
                                                type="button"
                                                class="btn btn-outline-secondary"
                                                @click="resetRubricForm"
                                            >
                                                Cancel Edit
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>

                            <div v-if="selectedRubricExamId" class="card shadow-sm">
                                <div class="card-body">
                                    <h5 class="mb-3">Assessment Criteria</h5>

                                    <div class="table-responsive">
                                        <table class="table table-hover align-middle">
                                            <thead>
                                                <tr>
                                                    <th>ID</th>
                                                    <th>Criterion</th>
                                                    <th>Maximum Marks</th>
                                                    <th>Weightage</th>
                                                    <th>Description</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                <tr v-for="rubric in rubrics" :key="rubric.id">
                                                    <td>{{ rubric.id }}</td>
                                                    <td>{{ rubric.criterion_name }}</td>
                                                    <td>{{ rubric.maximum_marks }}</td>
                                                    <td>{{ rubric.weightage }}%</td>
                                                    <td>{{ rubric.description || '—' }}</td>
                                                    <td>
                                                        <div class="d-flex gap-2">
                                                            <button
                                                                class="btn btn-sm btn-outline-primary"
                                                                @click="editRubric(rubric)"
                                                            >
                                                                Edit
                                                            </button>

                                                            <button
                                                                class="btn btn-sm btn-outline-danger"
                                                                @click="deleteRubric(rubric)"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                <tr v-if="rubrics.length === 0">
                                                    <td colspan="6" class="text-center text-muted">
                                                        No rubric criteria have been added.
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- SLOTS -->
                        <div v-if="activeSection === 'slots' && isAdmin">
                            <div class="alert alert-info">
                                <strong>Important:</strong>
                                An examiner must first declare availability for the selected date and time.
                                The backend also checks overlapping slots and examination status.
                            </div>

                            <div class="card shadow-sm mb-4">
                                <div class="card-body">
                                    <h5 class="mb-3">
                                        {{ editingSlotId ? 'Edit Slot' : 'Create Examination Slot' }}
                                    </h5>

                                    <form @submit.prevent="saveSlot">
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <label class="form-label">Examination</label>
                                                <select
                                                    v-model="slotForm.examination_id"
                                                    class="form-select"
                                                    required
                                                >
                                                    <option value="">Select examination</option>
                                                    <option
                                                        v-for="exam in examinationOptions"
                                                        :key="exam.id"
                                                        :value="String(exam.id)"
                                                    >
                                                        {{ exam.name }} ({{ exam.status }})
                                                    </option>
                                                </select>
                                            </div>

                                            <div class="col-md-6">
                                                <label class="form-label">Examiner</label>
                                                <select
                                                    v-model="slotForm.examiner_id"
                                                    class="form-select"
                                                    required
                                                >
                                                    <option value="">Select examiner</option>
                                                    <option
                                                        v-for="examiner in examinerOptions"
                                                        :key="examiner.id"
                                                        :value="String(examiner.id)"
                                                    >
                                                        {{ examiner.name || examiner.username }} — {{ examiner.email }}
                                                    </option>
                                                </select>
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Date</label>
                                                <input
                                                    v-model="slotForm.exam_date"
                                                    type="date"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Start Time</label>
                                                <input
                                                    v-model="slotForm.start_time"
                                                    type="time"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">End Time</label>
                                                <input
                                                    v-model="slotForm.end_time"
                                                    type="time"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Capacity</label>
                                                <input
                                                    v-model.number="slotForm.capacity"
                                                    type="number"
                                                    min="1"
                                                    class="form-control"
                                                    required
                                                >
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Status</label>
                                                <select
                                                    v-model="slotForm.status"
                                                    class="form-select"
                                                >
                                                    <option>Available</option>
                                                    <option>Cancelled</option>
                                                </select>
                                            </div>

                                            <div class="col-md-4">
                                                <label class="form-label">Meeting Link (optional)</label>
                                                <input
                                                    v-model.trim="slotForm.meeting_link"
                                                    type="url"
                                                    class="form-control"
                                                    placeholder="https://..."
                                                >
                                            </div>
                                        </div>

                                        <div class="mt-3 d-flex gap-2">
                                            <button
                                                class="btn btn-primary"
                                                :disabled="saving"
                                            >
                                                {{ saving ? 'Saving...' : (editingSlotId ? 'Update Slot' : 'Create Slot') }}
                                            </button>

                                            <button
                                                v-if="editingSlotId"
                                                type="button"
                                                class="btn btn-outline-secondary"
                                                @click="resetSlotForm"
                                            >
                                                Cancel Edit
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>

                            <div class="card shadow-sm">
                                <div class="card-body">
                                    <h5 class="mb-3">Scheduled Slots</h5>

                                    <div class="table-responsive">
                                        <table class="table table-hover align-middle">
                                            <thead>
                                                <tr>
                                                    <th>ID</th>
                                                    <th>Examination</th>
                                                    <th>Examiner</th>
                                                    <th>Date</th>
                                                    <th>Time</th>
                                                    <th>Capacity</th>
                                                    <th>Available Seats</th>
                                                    <th>Status</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                <tr v-for="slot in slots" :key="slot.id">
                                                    <td>{{ slot.id }}</td>
                                                    <td>{{ slot.examination_name || slot.examination_id }}</td>
                                                    <td>{{ slot.examiner_name || slot.examiner_id }}</td>
                                                    <td>{{ slot.exam_date }}</td>
                                                    <td>{{ slot.start_time }}–{{ slot.end_time }}</td>
                                                    <td>{{ slot.capacity }}</td>
                                                    <td>{{ slot.available_seats ?? '—' }}</td>
                                                    <td>
                                                        <span class="badge text-bg-secondary">
                                                            {{ slot.status }}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div class="d-flex gap-2">
                                                            <button
                                                                class="btn btn-sm btn-outline-primary"
                                                                @click="editSlot(slot)"
                                                            >
                                                                Edit
                                                            </button>

                                                            <button
                                                                class="btn btn-sm btn-outline-danger"
                                                                @click="deleteSlot(slot)"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                <tr v-if="slots.length === 0">
                                                    <td colspan="9" class="text-center text-muted">
                                                        No slots found.
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- GENERIC RECORD TABLES -->
                        <div
                            v-if="['users', 'availability', 'bookings', 'evaluations', 'results'].includes(activeSection)"
                            class="card shadow-sm"
                        >
                            <div class="card-body">
                                <h5 class="mb-3">{{ pageTitle }}</h5>

                                <p
                                    v-if="activeSection === 'availability'"
                                    class="text-muted"
                                >
                                    This is currently a record view. The availability creation and deletion form will be added in the next frontend step.
                                </p>

                                <p
                                    v-if="activeSection === 'bookings'"
                                    class="text-muted"
                                >
                                    This is currently a record view. Student slot booking and cancellation controls will be added in the next frontend step.
                                </p>

                                <p
                                    v-if="activeSection === 'evaluations'"
                                    class="text-muted"
                                >
                                    This is currently a record view. Examiner evaluation and marks submission controls will be added in the next frontend step.
                                </p>

                                <p
                                    v-if="activeSection === 'results'"
                                    class="text-muted"
                                >
                                    This view displays results returned by the backend.
                                </p>

                                <div
                                    v-if="activeSection === 'users'"
                                    class="alert alert-info"
                                >
                                    Examiner creation and user administration controls will be added in a later step.
                                </div>

                                <div v-if="records.length === 0" class="text-muted">
                                    No records found.
                                </div>

                                <div v-else class="table-responsive">
                                    <table class="table table-striped table-hover">
                                        <thead>
                                            <tr>
                                                <th
                                                    v-for="key in Object.keys(records[0])"
                                                    :key="key"
                                                >
                                                    {{ key.replaceAll('_', ' ') }}
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            <tr
                                                v-for="(record, index) in records"
                                                :key="record.id ?? index"
                                            >
                                                <td
                                                    v-for="key in Object.keys(records[0])"
                                                    :key="key"
                                                >
                                                    {{ displayValue(record[key]) }}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    `
}).mount("#app");