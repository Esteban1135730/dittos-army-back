import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { StockReviewService } from '../service/stock-review.service';
import { StockReviewOutcome } from '../schema/stock-review-session.schema';

@Controller('stock-review')
export class StockReviewController {
  constructor(private readonly stockReviewService: StockReviewService) {}

  @Get('active')
  async getActive() {
    const session = await this.stockReviewService.getActiveSession();
    return { session };
  }

  @Post('sessions')
  async createSession(
    @Body()
    body: { scope: 'all' | 'tag'; tag?: string },
  ) {
    const session = await this.stockReviewService.createSession(body);
    return { session };
  }

  @Get('sessions/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.stockReviewService.getSession(sessionId);
    return { session };
  }

  @Patch('sessions/:sessionId/items/:stockId/verify')
  async verifyItem(
    @Param('sessionId') sessionId: string,
    @Param('stockId') stockId: string,
  ) {
    const session = await this.stockReviewService.verifyItem(
      sessionId,
      stockId,
    );
    return { session };
  }

  @Post('sessions/:sessionId/scan')
  @HttpCode(HttpStatus.OK)
  async scanItem(
    @Param('sessionId') sessionId: string,
    @Body() body: { stock_id: string },
  ) {
    return this.stockReviewService.scanItem(sessionId, body?.stock_id);
  }

  @Post('sessions/:sessionId/finalize-verification')
  @HttpCode(HttpStatus.OK)
  async finalizeVerification(@Param('sessionId') sessionId: string) {
    const session =
      await this.stockReviewService.finalizeVerification(sessionId);
    return { session };
  }

  @Post('sessions/:sessionId/items/:stockId/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveItem(
    @Param('sessionId') sessionId: string,
    @Param('stockId') stockId: string,
    @Body()
    body: {
      outcome: StockReviewOutcome;
      amount_cop?: number;
    },
  ) {
    const session = await this.stockReviewService.resolveItem(
      sessionId,
      stockId,
      body.outcome,
      body.amount_cop,
    );
    return { session };
  }

  @Delete('sessions/:sessionId')
  async cancelSession(@Param('sessionId') sessionId: string) {
    await this.stockReviewService.cancelSession(sessionId);
    return { success: true };
  }
}
