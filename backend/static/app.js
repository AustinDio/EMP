
const { createApp } = Vue;

createApp({
    data() {
        return {
            user: null,
            checkingSession: true,
            loading: false,
            busy: false,
            error: "",
            message: "",

            authMode: "login",
            authForm: {
                username: "",
                email: "",
                password: ""
            },

            activeSection: "",

            courses: [],
            courseOptions: [],
            courseSearch: "",
            editingCourseId: null,
            courseForm: {
                course_code: "",
                course_name: "",
                description: ""
            },

            examinations: [],
            examSearch: "",
            editingExamId: null,
            examForm: {
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

            records: [],
            recordColumns: []
        };
    },

    computed: {
        role() {
            return String(this.user?.role || "").toLowerCase();
        },

        dashboardItems() {
            if (this.role === "admin") {
                return [
                    {
                        key: "courses",
                        icon: "📚",
                        title: "Manage Courses",
                        description: "Create, search, edit and delete courses."
                    },
                    {
                        key: "examinations",
                        icon: "📝",
                        title: "Manage Examinations",
                        description: "Configure exam details, schedules and status."
                    },
                    {
                        key: "users",
                        icon: "👥",
                        title: "Manage Users",
                        description: "View registered users and examiners."
                    }
                ];
            }

            if (this.role === "examiner") {
                return [
                    {
                        key: "availability",
                        icon: "🗓️",
                        title: "My Availability",
                        description: "View your declared availability."
                    },
                    {
                        key: "evaluations",
                        icon: "✍️",
                        title: "My Evaluations",
                        description: "View examinations assigned to you."
                    }
                ];
            }

            return [
                {
                    key: "bookings",
                    icon: "📅",
                    title: "My Bookings",
                    description: "View your examination bookings."
                },
                {
                    key: "results",
                    icon: "🎓",
                    title: "My Results",
                    description: "View published examination results."
                }
            ];
        },

        sectionTitle() {
            const titles = {
                courses: "Manage Courses",
                examinations: "Manage Examinations",
                users: "Manage Users",
                availability: "My Availability",
                evaluations: "My Evaluations",
                bookings: "My Bookings",
                results: "My Results"
            };

            return titles[this.activeSection] || "Dashboard";
        }
    },

    methods: {
        async api(url, options = {}) {
            const config = {
                ...options,
                credentials: "same-origin",
                headers: {
                    ...(options.body ? {
                        "Content-Type": "application/json"
                    } : {}),
                    ...(options.headers || {})
                }
            };

            const response = await fetch(url, config);
            const contentType = response.headers.get("content-type") || "";

            let data = {};

            if (contentType.includes("application/json")) {
                data = await response.json();
            } else {
                const text = await response.text();
                data = { message: text };
            }

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    data.error ||
                    data.description ||
                    `Request failed with status ${response.status}`
                );
            }

            return data;
        },

        getArray(data, keys = []) {
            if (Array.isArray(data)) return data;
            if (!data || typeof data !== "object") return [];

            for (const key of keys) {
                if (Array.isArray(data[key])) return data[key];
            }

            return [];
        },

        normalizeUser(data) {
            const candidate = data?.user || data?.current_user || data;

            if (!candidate || typeof candidate !== "object") return null;
            if (!candidate.role) return null;

            return candidate;
        },

        async loadCurrentUser() {
            this.checkingSession = true;

            try {
                const data = await this.api("/api/auth/me");
                this.user = this.normalizeUser(data);

                if (this.user) {
                    await this.loadCourseOptions();
                }
            } catch {
                this.user = null;
            } finally {
                this.checkingSession = false;
            }
        },

        async submitAuth() {
            this.error = "";
            this.message = "";
            this.busy = true;

            try {
                if (this.authMode === "register") {
                    await this.api("/api/auth/register", {
                        method: "POST",
                        body: JSON.stringify({
                            username: this.authForm.username,
                            email: this.authForm.email,
                            password: this.authForm.password,
                            role: "student"
                        })
                    });

                    this.authMode = "login";
                    this.authForm.password = "";
                    this.message = "Registration successful. Please log in.";
                    return;
                }

                await this.api("/api/auth/login", {
                    method: "POST",
                    body: JSON.stringify({
                        username: this.authForm.username || this.authForm.email,
                        email: this.authForm.email,
                        password: this.authForm.password
                    })
                });

                const data = await this.api("/api/auth/me");
                this.user = this.normalizeUser(data);

                if (!this.user) {
                    throw new Error(
                        "Login completed, but the current user could not be loaded."
                    );
                }

                this.authForm.password = "";
                this.activeSection = "";
                this.message = "Login successful.";
                await this.loadCourseOptions();
            } catch (err) {
                this.error = err.message || "Authentication failed.";
            } finally {
                this.busy = false;
            }
        },

        async logout() {
            this.error = "";
            this.message = "";
            this.busy = true;

            try {
                await this.api("/api/auth/logout", {
                    method: "POST",
                    body: JSON.stringify({})
                });

                this.message = "You have logged out.";
            } catch (err) {
                this.error = err.message || "Logout request failed.";
            } finally {
                this.user = null;
                this.activeSection = "";
                this.courses = [];
                this.examinations = [];
                this.records = [];
                this.busy = false;
            }
        },

        goHome() {
            this.activeSection = "";
            this.error = "";
            this.message = "";
            this.records = [];
            this.recordColumns = [];
        },

        async openSection(section) {
            this.activeSection = section;
            this.error = "";
            this.message = "";
            this.records = [];
            this.recordColumns = [];

            if (section === "courses") {
                await this.loadCourses();
                return;
            }

            if (section === "examinations") {
                await this.loadCourseOptions();
                await this.loadExaminations();
                return;
            }

            await this.loadRecords(section);
        },

        async refreshSection() {
            if (this.activeSection) {
                await this.openSection(this.activeSection);
            }
        },

        async loadCourseOptions() {
            try {
                const data = await this.api("/api/courses");
                this.courseOptions = this.getArray(
                    data,
                    ["courses", "items", "data"]
                );
            } catch {
                this.courseOptions = [];
            }
        },

        async loadCourses() {
            this.loading = true;
            this.error = "";

            try {
                const query = this.courseSearch
                    ? `?search=${encodeURIComponent(this.courseSearch)}`
                    : "";

                const data = await this.api(`/api/courses${query}`);

                this.courses = this.getArray(
                    data,
                    ["courses", "items", "data"]
                );

                await this.loadCourseOptions();
            } catch (err) {
                this.error = err.message || "Could not load courses.";
            } finally {
                this.loading = false;
            }
        },

        resetCourseForm() {
            this.editingCourseId = null;
            this.courseForm = {
                course_code: "",
                course_name: "",
                description: ""
            };
        },

        editCourse(course) {
            this.editingCourseId = course.id;

            this.courseForm = {
                course_code: course.course_code || "",
                course_name: course.course_name || "",
                description: course.description || ""
            };
        },

        async saveCourse() {
            this.busy = true;
            this.error = "";
            this.message = "";

            try {
                const editing = this.editingCourseId !== null;
                const url = editing
                    ? `/api/courses/${this.editingCourseId}`
                    : "/api/courses";

                await this.api(url, {
                    method: editing ? "PUT" : "POST",
                    body: JSON.stringify(this.courseForm)
                });

                this.message = editing
                    ? "Course updated successfully."
                    : "Course created successfully.";

                this.resetCourseForm();
                await this.loadCourses();
            } catch (err) {
                this.error = err.message || "Could not save course.";
            } finally {
                this.busy = false;
            }
        },

        async deleteCourse(course) {
            if (!window.confirm(
                `Delete course "${course.course_name}"?`
            )) return;

            this.busy = true;
            this.error = "";
            this.message = "";

            try {
                await this.api(`/api/courses/${course.id}`, {
                    method: "DELETE"
                });

                this.message = "Course deleted successfully.";
                await this.loadCourses();
            } catch (err) {
                this.error = err.message || "Could not delete course.";
            } finally {
                this.busy = false;
            }
        },

        resetExamForm() {
            this.editingExamId = null;
            this.examForm = {
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

        toDateTimeInput(value) {
            return value ? String(value).slice(0, 16) : "";
        },

        editExamination(exam) {
            this.editingExamId = exam.id;

            this.examForm = {
                course_id: String(exam.course_id ?? ""),
                name: exam.name || "",
                exam_type: exam.exam_type || "Viva",
                duration: Number(exam.duration || 30),
                maximum_marks: Number(exam.maximum_marks || 100),
                slot_creation_start: this.toDateTimeInput(
                    exam.slot_creation_start
                ),
                slot_creation_end: this.toDateTimeInput(
                    exam.slot_creation_end
                ),
                booking_start: this.toDateTimeInput(exam.booking_start),
                booking_end: this.toDateTimeInput(exam.booking_end),
                instructions: exam.instructions || "",
                status: exam.status || "Draft"
            };
        },

        examinationPayload() {
            const payload = {
                ...this.examForm,
                course_id: Number(this.examForm.course_id),
                duration: Number(this.examForm.duration),
                maximum_marks: Number(this.examForm.maximum_marks)
            };

            const dateFields = [
                "slot_creation_start",
                "slot_creation_end",
                "booking_start",
                "booking_end"
            ];

            for (const field of dateFields) {
                if (!payload[field]) payload[field] = null;
            }

            return payload;
        },

        async loadExaminations() {
            this.loading = true;
            this.error = "";

            try {
                const query = this.examSearch
                    ? `?search=${encodeURIComponent(this.examSearch)}`
                    : "";

                const data = await this.api(`/api/examinations${query}`);

                this.examinations = this.getArray(
                    data,
                    ["examinations", "exams", "items", "data"]
                );
            } catch (err) {
                this.error = err.message || "Could not load examinations.";
            } finally {
                this.loading = false;
            }
        },

        async saveExamination() {
            this.busy = true;
            this.error = "";
            this.message = "";

            try {
                const editing = this.editingExamId !== null;
                const url = editing
                    ? `/api/examinations/${this.editingExamId}`
                    : "/api/examinations";

                await this.api(url, {
                    method: editing ? "PUT" : "POST",
                    body: JSON.stringify(this.examinationPayload())
                });

                this.message = editing
                    ? "Examination updated successfully."
                    : "Examination created successfully.";

                this.resetExamForm();
                await this.loadExaminations();
            } catch (err) {
                this.error = err.message || "Could not save examination.";
            } finally {
                this.busy = false;
            }
        },

        async deleteExamination(exam) {
            if (!window.confirm(
                `Delete examination "${exam.name}"?`
            )) return;

            this.busy = true;
            this.error = "";
            this.message = "";

            try {
                await this.api(`/api/examinations/${exam.id}`, {
                    method: "DELETE"
                });

                this.message = "Examination deleted successfully.";
                await this.loadExaminations();
            } catch (err) {
                this.error = err.message || "Could not delete examination.";
            } finally {
                this.busy = false;
            }
        },

        async loadRecords(section) {
            const endpoints = {
                users: {
                    url: "/api/users",
                    keys: ["users", "items", "data"]
                },
                availability: {
                    url: "/api/availability",
                    keys: ["availability", "items", "data"]
                },
                bookings: {
                    url: "/api/bookings/my-bookings",
                    keys: ["bookings", "items", "data"]
                },
                evaluations: {
                    url: "/api/evaluations/my-evaluations",
                    keys: ["evaluations", "items", "data"]
                },
                results: {
                    url: "/api/results/my-results",
                    keys: ["results", "items", "data"]
                }
            };

            const endpoint = endpoints[section];

            if (!endpoint) {
                this.records = [];
                return;
            }

            this.loading = true;
            this.error = "";

            try {
                const data = await this.api(endpoint.url);

                this.records = this.getArray(data, endpoint.keys);

                this.recordColumns = this.records.length
                    ? Object.keys(this.records[0]).filter(key =>
                        this.records[0][key] === null ||
                        typeof this.records[0][key] !== "object"
                    )
                    : [];
            } catch (err) {
                this.records = [];
                this.recordColumns = [];
                this.error = err.message || "Could not load records.";
            } finally {
                this.loading = false;
            }
        },

        formatLabel(value) {
            return String(value)
                .replaceAll("_", " ")
                .replace(/\b\w/g, letter => letter.toUpperCase());
        },

        formatValue(value) {
            if (value === null || value === undefined || value === "") {
                return "—";
            }

            if (typeof value === "object") {
                return JSON.stringify(value);
            }

            return String(value);
        }
    },

    mounted() {
        this.loadCurrentUser();
    },

    template: `
        <div>
            <div v-if="checkingSession" class="loading-screen">
                <div class="spinner-border text-primary"></div>
                <p class="mt-3">Loading portal...</p>
            </div>

            <template v-else>
                <nav v-if="user" class="navbar navbar-dark portal-navbar px-3 py-3">
                    <div class="container-fluid">
                        <a class="navbar-brand fw-bold" href="#" @click.prevent="goHome">
                            Examination Portal
                        </a>

                        <div class="d-flex align-items-center gap-3">
                            <span class="text-white d-none d-md-inline">
                                {{ user.username || user.email }}
                                <span class="badge text-bg-light ms-1">
                                    {{ user.role }}
                                </span>
                            </span>
                            <button class="btn btn-outline-light btn-sm" @click="logout">
                                Log out
                            </button>
                        </div>
                    </div>
                </nav>

                <main class="container py-4 py-md-5">
                    <div v-if="message" class="alert alert-success alert-dismissible">
                        {{ message }}
                        <button class="btn-close" @click="message = ''"></button>
                    </div>

                    <div v-if="error" class="alert alert-danger alert-dismissible">
                        {{ error }}
                        <button class="btn-close" @click="error = ''"></button>
                    </div>

                    <section v-if="!user" class="auth-panel mx-auto">
                        <div class="text-center mb-4">
                            <div class="brand-mark mb-3">EP</div>
                            <h1 class="h3 fw-bold">Examination Portal</h1>
                            <p class="text-secondary">
                                Sign in to manage your examination activities.
                            </p>
                        </div>

                        <div class="btn-group w-100 mb-4">
                            <button
                                class="btn"
                                :class="authMode === 'login' ? 'btn-primary' : 'btn-outline-primary'"
                                @click="authMode = 'login'; error = ''; message = ''"
                            >
                                Login
                            </button>
                            <button
                                class="btn"
                                :class="authMode === 'register' ? 'btn-primary' : 'btn-outline-primary'"
                                @click="authMode = 'register'; error = ''; message = ''"
                            >
                                Register
                            </button>
                        </div>

                        <form @submit.prevent="submitAuth">
                            <div class="mb-3" v-if="authMode === 'register'">
                                <label class="form-label">Username</label>
                                <input v-model.trim="authForm.username" class="form-control" required>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Email</label>
                                <input v-model.trim="authForm.email" type="email" class="form-control" required>
                            </div>

                            <div class="mb-4">
                                <label class="form-label">Password</label>
                                <input v-model="authForm.password" type="password" class="form-control" required>
                            </div>

                            <button class="btn btn-primary w-100" :disabled="busy">
                                {{ busy ? "Please wait..." : (authMode === "login" ? "Log in" : "Register as Student") }}
                            </button>
                        </form>
                    </section>

                    <section v-else>
                        <div class="mb-4">
                            <p class="text-primary fw-semibold text-uppercase small mb-1">
                                {{ user.role }} dashboard
                            </p>
                            <h1 class="h2 fw-bold">
                                Welcome, {{ user.username || user.email }}
                            </h1>
                            <p class="text-secondary">
                                Select a section to continue.
                            </p>
                        </div>

                        <div v-if="!activeSection" class="row g-3">
                            <div
                                class="col-12 col-sm-6 col-lg-4"
                                v-for="item in dashboardItems"
                                :key="item.key"
                            >
                                <button
                                    class="dashboard-card w-100 text-start"
                                    @click="openSection(item.key)"
                                >
                                    <div class="dashboard-icon mb-3">{{ item.icon }}</div>
                                    <h2 class="h5 fw-bold">{{ item.title }}</h2>
                                    <p class="text-secondary mb-0">{{ item.description }}</p>
                                    <div class="mt-3 text-primary fw-semibold small">
                                        Open section →
                                    </div>
                                </button>
                            </div>
                        </div>

                        <section v-else>
                            <div class="mb-3">
                                <button class="btn btn-link px-0 text-decoration-none" @click="goHome">
                                    ← Back to Dashboard
                                </button>
                                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                                    <h2 class="h3 fw-bold mb-0">{{ sectionTitle }}</h2>
                                    <button class="btn btn-outline-secondary" @click="refreshSection">
                                        Refresh
                                    </button>
                                </div>
                            </div>

                            <!-- Course management -->
                            <div v-if="activeSection === 'courses' && role === 'admin'" class="row g-4">
                                <div class="col-12 col-lg-4">
                                    <div class="content-card">
                                        <h3 class="h5 fw-bold mb-3">
                                            {{ editingCourseId !== null ? 'Edit Course' : 'Add Course' }}
                                        </h3>

                                        <form @submit.prevent="saveCourse">
                                            <div class="mb-3">
                                                <label class="form-label">Course Code</label>
                                                <input v-model.trim="courseForm.course_code" class="form-control" required>
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Course Name</label>
                                                <input v-model.trim="courseForm.course_name" class="form-control" required>
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Description</label>
                                                <textarea v-model.trim="courseForm.description" class="form-control" rows="3"></textarea>
                                            </div>

                                            <button class="btn btn-primary w-100" :disabled="busy">
                                                {{ busy ? 'Saving...' : (editingCourseId !== null ? 'Update Course' : 'Create Course') }}
                                            </button>

                                            <button
                                                v-if="editingCourseId !== null"
                                                type="button"
                                                class="btn btn-outline-secondary w-100 mt-2"
                                                @click="resetCourseForm"
                                            >
                                                Cancel Edit
                                            </button>
                                        </form>
                                    </div>
                                </div>

                                <div class="col-12 col-lg-8">
                                    <div class="content-card">
                                        <form class="d-flex flex-wrap gap-2 justify-content-between mb-3" @submit.prevent="loadCourses">
                                            <h3 class="h5 fw-bold mb-0 align-self-center">Course List</h3>
                                            <div class="d-flex gap-2">
                                                <input v-model.trim="courseSearch" class="form-control" placeholder="Search courses">
                                                <button class="btn btn-outline-primary">Search</button>
                                            </div>
                                        </form>

                                        <div v-if="loading" class="text-center text-secondary py-4">
                                            Loading courses...
                                        </div>

                                        <div v-else-if="courses.length === 0" class="empty-state">
                                            No courses found.
                                        </div>

                                        <div v-else class="table-responsive">
                                            <table class="table align-middle">
                                                <thead>
                                                    <tr>
                                                        <th>Code</th>
                                                        <th>Course</th>
                                                        <th>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr v-for="course in courses" :key="course.id">
                                                        <td class="fw-semibold">{{ course.course_code }}</td>
                                                        <td>
                                                            {{ course.course_name }}
                                                            <div class="small text-secondary">{{ course.description || '' }}</div>
                                                        </td>
                                                        <td>
                                                            <div class="d-flex gap-2">
                                                                <button class="btn btn-sm btn-outline-primary" @click="editCourse(course)">
                                                                    Edit
                                                                </button>
                                                                <button class="btn btn-sm btn-outline-danger" :disabled="busy" @click="deleteCourse(course)">
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Examination management -->
                            <div v-else-if="activeSection === 'examinations' && role === 'admin'" class="row g-4">
                                <div class="col-12 col-lg-4">
                                    <div class="content-card">
                                        <h3 class="h5 fw-bold mb-3">
                                            {{ editingExamId !== null ? 'Edit Examination' : 'Create Examination' }}
                                        </h3>

                                        <form @submit.prevent="saveExamination">
                                            <div class="mb-3">
                                                <label class="form-label">Course</label>
                                                <select v-model="examForm.course_id" class="form-select" required>
                                                    <option value="" disabled>Select a course</option>
                                                    <option v-for="course in courseOptions" :key="course.id" :value="String(course.id)">
                                                        {{ course.course_code }} — {{ course.course_name }}
                                                    </option>
                                                </select>
                                                <small v-if="courseOptions.length === 0" class="text-danger">
                                                    Create a course first.
                                                </small>
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Examination Name</label>
                                                <input v-model.trim="examForm.name" class="form-control" required>
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Examination Type</label>
                                                <select v-model="examForm.exam_type" class="form-select" required>
                                                    <option>Viva</option>
                                                    <option>Practical</option>
                                                    <option>Project Demo</option>
                                                    <option>Assessment</option>
                                                </select>
                                            </div>

                                            <div class="row">
                                                <div class="col-6 mb-3">
                                                    <label class="form-label">Duration (minutes)</label>
                                                    <input v-model.number="examForm.duration" type="number" min="1" max="1440" class="form-control" required>
                                                </div>
                                                <div class="col-6 mb-3">
                                                    <label class="form-label">Maximum Marks</label>
                                                    <input v-model.number="examForm.maximum_marks" type="number" min="1" class="form-control" required>
                                                </div>
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Slot Creation Starts</label>
                                                <input v-model="examForm.slot_creation_start" type="datetime-local" class="form-control">
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Slot Creation Ends</label>
                                                <input v-model="examForm.slot_creation_end" type="datetime-local" class="form-control">
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Booking Starts</label>
                                                <input v-model="examForm.booking_start" type="datetime-local" class="form-control">
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Booking Ends</label>
                                                <input v-model="examForm.booking_end" type="datetime-local" class="form-control">
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Status</label>
                                                <select v-model="examForm.status" class="form-select">
                                                    <option>Draft</option>
                                                    <option>Slot Creation</option>
                                                    <option>Booking Open</option>
                                                    <option>Closed</option>
                                                    <option>Completed</option>
                                                </select>
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Instructions</label>
                                                <textarea v-model.trim="examForm.instructions" class="form-control" rows="3"></textarea>
                                            </div>

                                            <button class="btn btn-primary w-100" :disabled="busy || courseOptions.length === 0">
                                                {{ busy ? 'Saving...' : (editingExamId !== null ? 'Update Examination' : 'Create Examination') }}
                                            </button>

                                            <button
                                                v-if="editingExamId !== null"
                                                type="button"
                                                class="btn btn-outline-secondary w-100 mt-2"
                                                @click="resetExamForm"
                                            >
                                                Cancel Edit
                                            </button>
                                        </form>
                                    </div>
                                </div>

                                <div class="col-12 col-lg-8">
                                    <div class="content-card">
                                        <form class="d-flex flex-wrap justify-content-between gap-2 mb-3" @submit.prevent="loadExaminations">
                                            <h3 class="h5 fw-bold mb-0 align-self-center">Examinations</h3>
                                            <div class="d-flex gap-2">
                                                <input v-model.trim="examSearch" class="form-control" placeholder="Search examinations">
                                                <button class="btn btn-outline-primary">Search</button>
                                            </div>
                                        </form>

                                        <div v-if="loading" class="text-center text-secondary py-4">
                                            Loading examinations...
                                        </div>

                                        <div v-else-if="examinations.length === 0" class="empty-state">
                                            No examinations found.
                                        </div>

                                        <div v-else class="table-responsive">
                                            <table class="table align-middle">
                                                <thead>
                                                    <tr>
                                                        <th>Name</th>
                                                        <th>Course</th>
                                                        <th>Duration / Marks</th>
                                                        <th>Status</th>
                                                        <th>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr v-for="exam in examinations" :key="exam.id">
                                                        <td>
                                                            <div class="fw-semibold">{{ exam.name }}</div>
                                                            <small class="text-secondary">{{ exam.exam_type }}</small>
                                                        </td>
                                                        <td>
                                                            {{ exam.course_code || '—' }}
                                                            <div class="small text-secondary">{{ exam.course_name || '' }}</div>
                                                        </td>
                                                        <td>
                                                            {{ exam.duration }} min
                                                            <div class="small text-secondary">{{ exam.maximum_marks }} marks</div>
                                                        </td>
                                                        <td><span class="status-pill">{{ exam.status }}</span></td>
                                                        <td>
                                                            <div class="d-flex gap-2">
                                                                <button class="btn btn-sm btn-outline-primary" @click="editExamination(exam)">
                                                                    Edit
                                                                </button>
                                                                <button class="btn btn-sm btn-outline-danger" :disabled="busy" @click="deleteExamination(exam)">
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Initial record views for the other sections -->
                            <div v-else class="content-card">
                                <div v-if="loading" class="text-center text-secondary py-4">
                                    Loading records...
                                </div>

                                <div v-else-if="records.length === 0" class="empty-state">
                                    No records found in this section.
                                </div>

                                <div v-else class="table-responsive">
                                    <table class="table align-middle">
                                        <thead>
                                            <tr>
                                                <th v-for="column in recordColumns" :key="column">
                                                    {{ formatLabel(column) }}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="(record, index) in records" :key="record.id || index">
                                                <td v-for="column in recordColumns" :key="column">
                                                    {{ formatValue(record[column]) }}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    </section>
                </main>

                <footer class="container text-center py-4 text-secondary small">
                    Examination Management Portal V2
                </footer>
            </template>
        </div>
    `
}).mount("#app");
