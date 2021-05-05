<template>
	<div v-if="loading" class="mt-5 md:mt-0 md:col-span-2 max-w-md mx-auto">
		<div class="shadow overflow-hidden sm:rounded-md">
			<div class="px-4 py-5 bg-white sm:p-6">Odota...</div>
		</div>
	</div>
	<div v-else class="max-w-md mx-auto">
		<div v-if="loggedIn" class="mt-5 md:mt-0 md:col-span-2">
			<div class="shadow overflow-hidden sm:rounded-md">
				<div
					class="px-4 py-24 bg-white bg-gradient-to-t from-blue-50 to-transparent flex justify-center"
				>
					<div
						v-if="status.enabled"
						title="Päällä"
						class="h-24 w-24 rounded-2xl bg-white shadow-lg items-center flex justify-center relative"
					>
						<span
							class="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-green-200 opacity-75"
						></span>
						<span
							class="animate-pulse relative inline-flex rounded-full h-5 w-5 bg-green-400"
						></span>
					</div>
					<div
						v-else
						title="Pois päältä"
						class="h-24 w-24 rounded-2xl bg-red-100 animate-pulsate shadow-lg items-center flex justify-center relative"
					>
						<span
							class="animate-pulse relative inline-flex rounded-full h-10 w-10 bg-red-50"
						></span>
					</div>
				</div>
				<div class="px-4 py-3 bg-white text-center sm:px-6">
					<button
						@click="disable"
						type="submit"
						class="mr-2 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
					>
						Kytke pois
					</button>
					<button
						@click="enable"
						type="submit"
						class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
					>
						Kytke päälle
					</button>
				</div>
			</div>
		</div>

		<form action="#" @submit="login" v-else class="mt-5 md:mt-0 md:col-span-2">
			<div class="shadow overflow-hidden sm:rounded-md">
				<div class="px-4 py-5 bg-white sm:p-6">
					<label
						for="first_name"
						class="block text-sm font-medium text-gray-700"
						>Salasana</label
					>
					<input
						v-model="password"
						type="password"
						name="password"
						class="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
					/>
				</div>
				<div class="px-4 py-3 bg-gray-50 text-right sm:px-6">
					<button
						type="submit"
						class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
					>
						Kirjaudu ja tallenna
					</button>
				</div>
			</div>
		</form>
	</div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import axios from "axios";
axios.defaults.baseURL = "/wall";

export default defineComponent({
	name: "App",
	components: {},
	data() {
		return {
			loggedIn: false,
			counter: 0,
			loading: false,
			status: { enabled: false },
			password: "",
		};
	},
	created() {
		const password = window.localStorage.getItem("password");
		if (password !== null) {
			this.loggedIn = true;
			this.password = password;
			this.getStatus();
		}
		setInterval(() => {
			if (this.loggedIn) {
				this.getStatus();
			}
		}, 5_000);
	},
	methods: {
		async getStatus() {
			try {
				this.loading = true;
				this.status = await axios
					.get("/status", { headers: { password: this.password } })
					.then((res) => res.data);
			} catch (e) {
				console.error(e);
				if (e.response.status === 403) {
					this.password = "";
					this.loggedIn = false;
					window.localStorage.removeItem("password");
				}
			}
			this.loading = false;
		},
		async enable() {
			this.loading = true;
			try {
				await axios.post(
					"/enable",
					{},
					{ headers: { password: this.password } }
				);
			} catch (e) {
				console.error(e);
			}
			this.getStatus();
		},
		async disable() {
			this.loading = true;
			try {
				await axios.post(
					"/disable",
					{},
					{ headers: { password: this.password } }
				);
			} catch (e) {
				console.error(e);
			}
			this.getStatus();
		},
		login(e: Event) {
			e.preventDefault();
			e.stopPropagation();
			window.localStorage.setItem("password", this.password);
			this.loggedIn = true;
			this.getStatus();
		},
	},
});
</script>

<style>
#app {
	font-family: Avenir, Helvetica, Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	text-align: center;
	color: #2c3e50;
	margin-top: 60px;
}
</style>
