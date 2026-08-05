import { describe, expect, it, jest } from "@jest/globals";
import type { Database } from "../../../src/models/types";
import {
	createTicketService,
	type TicketRepository,
} from "../../../src/services/ticketService";
import { calculatePriority } from "../../../src/services/ticketPriorityService";

function createDatabase(): Database {
	return {
		users: [
			{
				id: "user_1",
				name: "Ana",
				email: "ana@example.com",
				role: "student",
				passwordHash: "hashed-secret",
			},
			{
				id: "support_1",
				name: "Bruno",
				email: "bruno@example.com",
				role: "support",
				passwordHash: "hashed-secret",
			},
		],
		tickets: [
			{
				id: "ticket_1",
				title: "Problema no sistema",
				description: "Erro ao abrir o portal",
				category: "sistemas",
				status: "open",
				priority: "high",
				requesterId: "user_1",
				createdAt: "2026-06-01T00:00:00.000Z",
				updatedAt: "2026-06-01T00:00:00.000Z",
			},
			{
				id: "ticket_2",
				title: "Rede fora do ar",
				description: "Internet caiu no laboratorio",
				category: "infra",
				status: "in_progress",
				priority: "urgent",
				requesterId: "user_1",
				assignedToId: "support_1",
				createdAt: "2026-06-02T00:00:00.000Z",
				updatedAt: "2026-06-02T00:00:00.000Z",
			},
		],
		comments: [
			{
				id: "comment_existing",
				ticketId: "ticket_2",
				authorId: "support_1",
				message: "Estamos verificando",
				createdAt: "2026-06-02T01:00:00.000Z",
			},
		],
	};
}

function createFakeTicketRepository(database = createDatabase()) {
	const repository: TicketRepository = {
		readDatabase: jest.fn(() => database),
		writeDatabase: jest.fn(),
	};

	return { database, repository };
}

describe("calculatePriority", () => {
	it("returns urgent for infra category", () => {
		expect(calculatePriority("infra", "Sem internet")).toBe("urgent");
	});

	it("returns urgent when description contains urgente", () => {
		expect(calculatePriority("outros", "Chamado urgente")).toBe("urgent");
	});

	it("returns high for sistemas category", () => {
		expect(calculatePriority("sistemas", "Erro no portal")).toBe("high");
	});

	it("returns medium for academico category", () => {
		expect(calculatePriority("academico", "Duvida sobre matricula")).toBe(
			"medium",
		);
	});

	it("returns low when no rule matches", () => {
		expect(calculatePriority("outros", "Solicitacao comum")).toBe("low");
	});
});

describe("createTicketService", () => {
	describe("createTicket", () => {
		it("creates a ticket when requester exists", () => {
			const { database, repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.createTicket({
				title: "Rede lenta",
				description: "Internet lenta no laboratorio",
				category: "infra",
				requesterId: "user_1",
				assignedToId: "support_1",
			});

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.ticket.id).toMatch(/^ticket_/);
			expect(result.ticket.status).toBe("open");
			expect(result.ticket.priority).toBe("urgent");
		});

		it("persists the created ticket", () => {
			const { database, repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.createTicket({
				title: "Rede lenta",
				description: "Internet lenta no laboratorio",
				category: "infra",
				requesterId: "user_1",
			});

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(database.tickets).toContain(result.ticket);
			expect(repository.writeDatabase).toHaveBeenCalledWith(database);
		});

		it("does not create a ticket when requester does not exist", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.createTicket({
				title: "Rede lenta",
				description: "Internet lenta no laboratorio",
				category: "infra",
				requesterId: "missing_user",
			});

			expect(result).toEqual({
				success: false,
				message: "Solicitante invalido",
			});
			expect(repository.writeDatabase).not.toHaveBeenCalled();
		});
	});

	describe("updateTicketStatus", () => {
		it("updates status of an existing ticket", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.updateTicketStatus({
				ticketId: "ticket_1",
				status: "in_progress",
			});

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.ticket.status).toBe("in_progress");
			expect(repository.writeDatabase).toHaveBeenCalled();
		});

		it("updates the updatedAt timestamp", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.updateTicketStatus({
				ticketId: "ticket_1",
				status: "in_progress",
			});

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.ticket.updatedAt).not.toBe("2026-06-01T00:00:00.000Z");
		});

		it("returns 404 when ticket does not exist", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.updateTicketStatus({
				ticketId: "nonexistent",
				status: "in_progress",
			});

			expect(result).toEqual({
				success: false,
				statusCode: 404,
				message: "Ticket nao encontrado",
			});
			expect(repository.writeDatabase).not.toHaveBeenCalled();
		});

		it("requires a comment when closing a ticket", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.updateTicketStatus({
				ticketId: "ticket_1",
				status: "closed",
			});

			expect(result).toEqual({
				success: false,
				statusCode: 400,
				message: "Informe um comentario para fechar o chamado",
			});
			expect(repository.writeDatabase).not.toHaveBeenCalled();
		});

		it("closes a ticket when comment is provided", () => {
			const { database, repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.updateTicketStatus({
				ticketId: "ticket_1",
				status: "closed",
				comment: "Problema resolvido",
				authorId: "support_1",
			});

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.ticket.status).toBe("closed");
			expect(database.comments).toHaveLength(2);

			const addedComment = database.comments.find(
				(c) => c.ticketId === "ticket_1",
			);
			expect(addedComment).toBeDefined();
			expect(addedComment?.message).toBe("Problema resolvido");
			expect(addedComment?.authorId).toBe("support_1");
		});

		it("uses requesterId as comment author when authorId is not provided", () => {
			const { database, repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.updateTicketStatus({
				ticketId: "ticket_1",
				status: "resolved",
				comment: "Resolvido pelo usuario",
			});

			expect(result.success).toBe(true);
			if (!result.success) return;

			const addedComment = database.comments.find(
				(c) => c.ticketId === "ticket_1",
			);
			expect(addedComment?.authorId).toBe("user_1");
		});
	});

	describe("addCommentToTicket", () => {
		it("adds a comment to an existing ticket", () => {
			const { database, repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.addCommentToTicket({
				ticketId: "ticket_1",
				authorId: "support_1",
				message: "Chamado em analise",
			});

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.comment.id).toMatch(/^comment_/);
			expect(result.comment.ticketId).toBe("ticket_1");
		});

		it("persists the added comment", () => {
			const { database, repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.addCommentToTicket({
				ticketId: "ticket_1",
				authorId: "support_1",
				message: "Chamado em analise",
			});

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(database.comments).toContain(result.comment);
			expect(repository.writeDatabase).toHaveBeenCalledWith(database);
		});

		it("updates the ticket updatedAt timestamp", () => {
			const { database, repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			ticketService.addCommentToTicket({
				ticketId: "ticket_1",
				authorId: "support_1",
				message: "Atualizacao",
			});

			const ticket = database.tickets.find((t) => t.id === "ticket_1");
			expect(ticket?.updatedAt).not.toBe("2026-06-01T00:00:00.000Z");
		});

		it("returns 404 when ticket does not exist", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.addCommentToTicket({
				ticketId: "nonexistent",
				authorId: "support_1",
				message: "Teste",
			});

			expect(result).toEqual({
				success: false,
				statusCode: 404,
				message: "Ticket nao encontrado",
			});
			expect(repository.writeDatabase).not.toHaveBeenCalled();
		});
	});

	describe("listTickets", () => {
		it("returns all tickets when no filters are applied", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({});

			expect(result).toHaveLength(2);
		});

		it("filters tickets by status", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({ status: "open" });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("ticket_1");
		});

		it("filters tickets by category", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({ category: "infra" });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("ticket_2");
		});

		it("filters tickets by search term in title", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({ search: "rede" });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("ticket_2");
		});

		it("filters tickets by search term in description", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({ search: "portal" });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("ticket_1");
		});

		it("search is case-insensitive", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({ search: "REDE" });

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("ticket_2");
		});

		it("returns empty array when no tickets match filters", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({ status: "closed" });

			expect(result).toHaveLength(0);
		});

		it("combines multiple filters", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({
				status: "open",
				category: "infra",
			});

			expect(result).toHaveLength(0);
		});

		it("returns tickets with commentsCount", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({});

			const ticket1 = result.find((t) => t.id === "ticket_1");
			const ticket2 = result.find((t) => t.id === "ticket_2");
			expect(ticket1?.commentsCount).toBe(0);
			expect(ticket2?.commentsCount).toBe(1);
		});

		it("returns tickets with requester info (without passwordHash)", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.listTickets({});

			expect(result[0].requester).toBeDefined();
			expect(result[0].requester?.name).toBe("Ana");
			expect(result[0].requester).not.toHaveProperty("passwordHash");
		});
	});

	describe("getTicketSummary", () => {
		it("returns correct counts per status", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const summary = ticketService.getTicketSummary();

			expect(summary.open).toBe(1);
			expect(summary.in_progress).toBe(1);
			expect(summary.resolved).toBe(0);
			expect(summary.closed).toBe(0);
		});

		it("counts urgent tickets", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const summary = ticketService.getTicketSummary();

			expect(summary.urgent).toBe(1);
		});

		it("returns all zeros for an empty database", () => {
			const emptyDb: Database = { users: [], tickets: [], comments: [] };
			const { repository } = createFakeTicketRepository(emptyDb);
			const ticketService = createTicketService(repository);

			const summary = ticketService.getTicketSummary();

			expect(summary).toEqual({
				open: 0,
				in_progress: 0,
				resolved: 0,
				closed: 0,
				urgent: 0,
			});
		});
	});

	describe("getTicketDetails", () => {
		it("returns ticket details with comments", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.getTicketDetails("ticket_2");

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.ticket.id).toBe("ticket_2");
			expect(result.ticket.comments).toHaveLength(1);
			expect(result.ticket.comments[0].message).toBe("Estamos verificando");
		});

		it("returns ticket with requester and assigned user info", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.getTicketDetails("ticket_2");

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.ticket.requester?.name).toBe("Ana");
			expect(result.ticket.assigned?.name).toBe("Bruno");
			expect(result.ticket.requester).not.toHaveProperty("passwordHash");
			expect(result.ticket.assigned).not.toHaveProperty("passwordHash");
		});

		it("returns ticket with empty comments array when no comments exist", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.getTicketDetails("ticket_1");

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.ticket.comments).toHaveLength(0);
		});

		it("includes author info in comments", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.getTicketDetails("ticket_2");

			expect(result.success).toBe(true);
			if (!result.success) return;

			expect(result.ticket.comments[0].author?.name).toBe("Bruno");
			expect(result.ticket.comments[0].author).not.toHaveProperty("passwordHash");
		});

		it("returns 404 when ticket does not exist", () => {
			const { repository } = createFakeTicketRepository();
			const ticketService = createTicketService(repository);

			const result = ticketService.getTicketDetails("nonexistent");

			expect(result).toEqual({
				success: false,
				statusCode: 404,
				message: "Ticket nao encontrado",
			});
		});
	});
});
