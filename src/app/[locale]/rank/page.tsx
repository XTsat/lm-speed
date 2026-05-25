'use client'

import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Settings2, RefreshCw } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import useSWR from 'swr'
import { getProvider, getModel, getModelByName } from '@/lib/info'
import { Link } from '@/i18n/routing'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import Image from 'next/image'
import { getTestResults, type SpeedTestResult as LocalSpeedTestResult } from '@/lib/local-storage'

type RankingResult = {
	model: string
	baseUrl: string
	maxTokensPerSecond: number
	minTokensPerSecond: number
	avgTokensPerSecond: number
	avgTokensPerSecondTotal: number
	maxFirstTokenLatency: number
	minFirstTokenLatency: number
	avgFirstTokenLatency: number
	totalTests: number
}

// 从 localStorage 生成排名数据
function getLocalRankingResults(): RankingResult[] {
	const localResults = getTestResults()
	if (localResults.length === 0) return []

	// 按 model + baseUrl 分组
	const grouped: Record<string, {
		baseUrl: string
		model: string
		tokensPerSecond: number[]
		tokensPerSecondTotal: number[]
		firstTokenLatency: number[]
	}> = {}

	localResults.forEach(test => {
		test.results.forEach(result => {
			const key = `${result.model}-${test.baseUrl}`
			if (!grouped[key]) {
				grouped[key] = {
					baseUrl: test.baseUrl,
					model: result.model,
					tokensPerSecond: [],
					tokensPerSecondTotal: [],
					firstTokenLatency: []
				}
			}
			grouped[key].tokensPerSecond.push(result.tokensPerSecond)
			grouped[key].tokensPerSecondTotal.push(result.tokensPerSecondTotal)
			grouped[key].firstTokenLatency.push(result.firstTokenLatency)
		})
	})

	return Object.values(grouped).map(g => ({
		model: g.model,
		baseUrl: g.baseUrl,
		maxTokensPerSecond: Math.max(...g.tokensPerSecond),
		minTokensPerSecond: Math.min(...g.tokensPerSecond),
		avgTokensPerSecond: g.tokensPerSecond.reduce((a, b) => a + b, 0) / g.tokensPerSecond.length,
		avgTokensPerSecondTotal: g.tokensPerSecondTotal.reduce((a, b) => a + b, 0) / g.tokensPerSecondTotal.length,
		maxFirstTokenLatency: Math.max(...g.firstTokenLatency),
		minFirstTokenLatency: Math.min(...g.firstTokenLatency),
		avgFirstTokenLatency: g.firstTokenLatency.reduce((a, b) => a + b, 0) / g.firstTokenLatency.length,
		totalTests: g.tokensPerSecond.length
	}))
}

export default function RankPage() {
	const t = useTranslations('rank')
	const [filters, setFilters] = useState<{
		searchModel: string;
		baseUrl: string;
		timeRange: string;
		metric: string;
		listModel: string[];
		listBaseHost: string[];
	}>({
		searchModel: '',
		baseUrl: '',
		timeRange: 'all',
		metric: 'tokensPerSecond',
		listModel: [],
		listBaseHost: [],
	})

	const [badgeIndex, setBadgeIndex] = useState(0)

	const badges = [
		{
			name: 'All',
			searchModel: '',
		},
		{
			name: 'DeepSeek',
			searchModel: 'deepseek',
		},
		{
			name: 'Gemini',
			searchModel: 'gemini',
		},
		{
			name: 'Qwen',
			searchModel: 'qwen',
		},
		{
			name: 'GPT',
			searchModel: 'gpt',
		},
	]

	const handleChangeBadge = (index: number) => {
		const badge = badges[index]
		console.log(badge)
		setBadgeIndex(index)
		setFilters({
			...filters,
			searchModel: badges[index].searchModel || '',
			listModel: (badge.listModel as string[] | undefined) || [],
		})
	}

	const [visibleColumns, setVisibleColumns] = useState({
		model: true,
		baseUrl: true,
		avgTokens: true,
		maxMinTokens: true,
		totalAvgTokens: false,
		avgLatency: true,
		maxMinLatency: false,
		totalTests: true,
	})

	const toggleColumn = (columnId: keyof typeof visibleColumns) => {
		setVisibleColumns((prev) => ({
			...prev,
			[columnId]: !prev[columnId],
		}))
	}

	const [localResults, setLocalResults] = useState<RankingResult[]>([])

	const loadLocalResults = () => {
		const localData = getLocalRankingResults()
		setLocalResults(localData)
	}

	useEffect(() => {
		// 从 localStorage 获取数据
		loadLocalResults()

		// 监听 localStorage 变化
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === 'lm-speed-test-results') {
				loadLocalResults()
			}
		}

		// 监听自定义事件，用于同一页面内的数据更新通知
		const handleTestCompleted = () => {
			loadLocalResults()
		}

		window.addEventListener('storage', handleStorageChange)
		window.addEventListener('lm-speed-test-completed', handleTestCompleted)

		return () => {
			window.removeEventListener('storage', handleStorageChange)
			window.removeEventListener('lm-speed-test-completed', handleTestCompleted)
		}
	}, [])

	// 添加一个刷新按钮的点击处理
	const handleRefresh = () => {
		loadLocalResults()
	}

	const fetcher = ({ url, args }: { url: string; args: never }) =>
		fetch(`${url}?${new URLSearchParams(args)}`).then((res) => res.json())
	const {
		data: apiData,
		error: apiError,
		isLoading: apiLoading,
	} = useSWR<{ results: RankingResult[] }>({ url: '/api/speed/rank', args: filters }, fetcher)

	// 优先使用 API 数据，如果没有则使用本地数据
	let rawResults = apiData?.results && apiData.results.length > 0 ? apiData.results : localResults
	
	// 对本地数据应用筛选条件
	if (!apiData?.results || apiData.results.length === 0) {
		rawResults = rawResults.filter(result => {
			// 根据 searchModel 筛选（模糊匹配）
			if (filters.searchModel && !result.model.toLowerCase().includes(filters.searchModel.toLowerCase())) {
				return false
			}
			// 根据 listModel 筛选（精确匹配）
			if (filters.listModel.length > 0 && !filters.listModel.includes(result.model)) {
				return false
			}
			return true
		})
	}
	
	// 根据选择的指标对数据进行排序
	const sortedResults = [...rawResults].sort((a, b) => {
		if (filters.metric === 'tokensPerSecond') {
			// 按 tokensPerSecond 降序排序（越高越好）
			return b.avgTokensPerSecond - a.avgTokensPerSecond
		} else {
			// 按 firstTokenLatency 升序排序（越低越好）
			return a.avgFirstTokenLatency - b.avgFirstTokenLatency
		}
	})
	
	const data = { results: sortedResults }
	const error = apiError
	const loading = apiLoading && localResults.length === 0

	const formatNumber = (num: number) => num?.toFixed(2)
	const getHost = (baseUrl: string) => new URL(baseUrl).host

	// 获取最大值，处理空数组情况
	const getMaxValue = (values: number[]) => {
		if (values.length === 0) return 1
		return Math.max(...values)
	}

	if (error) return <div>Error: {error.message}</div>

	return (
		<div className="max-w-7xl mx-auto">
			<div className="max-w-4xl mx-auto pb-16">
				<h1 className="text-3xl font-bold text-center">{t('title')}</h1>
			</div>
			<div className="space-y-4">
				<div className="mb-6 flex flex-col md:flex-row gap-4 items-start md:items-center md:justify-between">
					<div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
						<Select
							value={filters.timeRange}
							onValueChange={(value: string) => setFilters({ ...filters, timeRange: value })}
						>
							<SelectTrigger className="w-full md:w-[180px] bg-transparent">
								<SelectValue placeholder={t('timeRange.label')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{t('timeRange.all')}</SelectItem>
								<SelectItem value="day">{t('timeRange.day')}</SelectItem>
								<SelectItem value="week">{t('timeRange.week')}</SelectItem>
								<SelectItem value="month">{t('timeRange.month')}</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-wrap md:flex-row items-center gap-2">
						{badges.map((badge, index) => (
							<Badge
								key={index}
								onClick={() => handleChangeBadge(index)}
								variant={badgeIndex === index ? 'default' : 'outline'}
								className="cursor-pointer py-2 px-4 font-normal"
							>
								{badge.name}
							</Badge>
						))}
						<Input
							placeholder={t('customFilter')}
							value={filters.searchModel}
							onChange={(e) => {
								setFilters({ ...filters, searchModel: e.target.value })
								setBadgeIndex(-1) // 清除选中的标签
							}}
							className="w-40 md:w-48"
						/>
					</div>

					<div className="flex gap-4 w-full md:w-auto">
						<Select
							value={filters.metric}
							onValueChange={(value: string) => setFilters({ ...filters, metric: value })}
						>
							<SelectTrigger className="w-full md:w-[132px] bg-transparent">
								<SelectValue placeholder={t('metric.label')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="tokensPerSecond">{t('table.avgTokens')}</SelectItem>
								<SelectItem value="firstTokenLatency">{t('table.avgLatency')}</SelectItem>
							</SelectContent>
						</Select>

						<Button
								variant="outline"
								size="icon"
								onClick={handleRefresh}
							>
								<RefreshCw className="h-4 w-4" />
							</Button>
						<Popover>
							<PopoverTrigger asChild>
								<Button variant="outline" size="icon">
									<Settings2 className="h-4 w-4" />
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-80">
								<div className="grid gap-4">
									<div className="space-y-2">
										<h4 className="font-medium leading-none">{t('columnSettings')}</h4>
										<p className="text-sm text-muted-foreground">
											{t('columnSettingsDesc')}
										</p>
									</div>
									<div className="grid gap-2">
										{Object.entries(visibleColumns).map(([key, value]) => (
											<div key={key} className="flex items-center space-x-2">
												<Checkbox
													id={key}
													checked={value}
													onCheckedChange={() =>
														toggleColumn(key as keyof typeof visibleColumns)
													}
												/>
												<label
													htmlFor={key}
													className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
												>
													{t(`table.${key}`)}
												</label>
											</div>
										))}
									</div>
								</div>
							</PopoverContent>
						</Popover>
					</div>
				</div>

				<div id="ranking" className="overflow-x-auto border rounded-md relative">
					<div className="fixed inset-0 pointer-events-none select-none z-10 overflow-hidden">
						<div className="absolute inset-0 flex items-center justify-center opacity-[0.03] -rotate-12">
							<div className="whitespace-nowrap text-4xl font-bold">
								{Array(5).fill('LM Speed').join('     ')}
							</div>
						</div>
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[40px]">#</TableHead>
								{visibleColumns.model && (
									<TableHead className="min-w-[150px]">{t('table.model')}</TableHead>
								)}
								{visibleColumns.avgTokens && (
									<TableHead className="min-w-[180px]">{t('table.avgTokens')}</TableHead>
								)}
								{visibleColumns.maxMinTokens && (
									<TableHead className="min-w-[120px]">{t('table.maxMinTokens')}</TableHead>
								)}
								{visibleColumns.totalAvgTokens && (
									<TableHead className="min-w-[150px]">
										{t('table.totalAvgTokens')}
									</TableHead>
								)}
								{visibleColumns.avgLatency && (
									<TableHead className="min-w-[150px]">{t('table.avgLatency')}</TableHead>
								)}
								{visibleColumns.maxMinLatency && (
									<TableHead className="min-w-[120px]">
										{t('table.maxMinLatency')}
									</TableHead>
								)}
								{visibleColumns.totalTests && (
									<TableHead className="min-w-[100px]">{t('table.totalTests')}</TableHead>
								)}
							</TableRow>
						</TableHeader>
						<TableBody>
							{loading ? (
								<TableRow>
									<TableCell colSpan={9} className="text-center h-32 md:h-64">
										{t('table.loading')}
									</TableCell>
								</TableRow>
							) : error ? (
								<TableRow>
									<TableCell colSpan={9} className="text-center h-32 md:h-64 text-red-500">
										{t('table.error')}
									</TableCell>
								</TableRow>
							) : data?.results.length === 0 ? (
								<TableRow>
									<TableCell colSpan={9} className="text-center h-32 md:h-64">
										{t('table.noResults')}
									</TableCell>
								</TableRow>
							) : (
								data?.results.map((result, index) => (
									<TableRow key={index}>
										<TableCell>{index + 1}</TableCell>
										{visibleColumns.model && (
											<TableCell>
												<div className="flex flex-col">
													{getModel(result.model) ? (
														<TooltipProvider delayDuration={100}>
															<Tooltip>
																<TooltipTrigger asChild>
																	<div className="flex flex-row items-center gap-1 w-fit">
																		{getModel(result.model)?.name}{' '}
																		{getModel(result.model)
																			?.parameters && (
																			<Badge
																				variant="secondary"
																				className="py-0.5"
																			>
																				{
																					getModel(result.model)
																						?.parameters
																				}
																				B
																			</Badge>
																		)}
																	</div>
																</TooltipTrigger>
																<TooltipContent>
																	<p>{result.model}</p>
																</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													) : (
														result.model
													)}
													{visibleColumns.baseUrl && (
														<>
															<Link
																href={`/provider/${getHost(result.baseUrl)}`}
															>
																<div className="text-gray-500">
																	{getProvider(result.baseUrl) ? (
																		<div className="flex flex-row gap-1 items-center">
																			<Image
																				className="block w-4 h-4"
																				width="16"
																				height="16"
																				src={`https://unavatar.io/google/${getHost(
																					getProvider(
																						result.baseUrl
																					)?.url || result.baseUrl
																				)}`}
																				alt={
																					getProvider(
																						result.baseUrl
																					)?.name || ''
																				}
																			/>
																			{
																				getProvider(result.baseUrl)
																					?.name
																			}
																		</div>
																	) : (
																		getHost(result.baseUrl)
																	)}
																</div>
															</Link>
														</>
													)}
												</div>
											</TableCell>
										)}

										{visibleColumns.avgTokens && (
											<TableCell>
												<div className="flex flex-col md:flex-row items-start md:items-center gap-2">
													<div className="w-full md:w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
														<div
															className="h-full bg-primary"
															style={{
																width: `${
																	(result.avgTokensPerSecond /
																		getMaxValue(
																			data?.results.map(
																				(r) => r.avgTokensPerSecond
																			) || []
																		)) *
																	100
																}%`,
															}}
														/>
													</div>
													<span className="whitespace-nowrap">
														{formatNumber(result.avgTokensPerSecond)}
													</span>
												</div>
											</TableCell>
										)}
										{visibleColumns.maxMinTokens && (
											<TableCell className="whitespace-nowrap">
												{formatNumber(result.maxTokensPerSecond)}/
												{formatNumber(result.minTokensPerSecond)}
											</TableCell>
										)}
										{visibleColumns.totalAvgTokens && (
											<TableCell>
												<div className="flex flex-col md:flex-row items-start md:items-center gap-2">
													<div className="w-full md:w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
														<div
															className="h-full bg-primary"
															style={{
																width: `${
																	(result.avgTokensPerSecondTotal /
																		getMaxValue(
																			data?.results.map(
																				(r) =>
																					r.avgTokensPerSecondTotal
																			) || []
																		)) *
																	100
																}%`,
															}}
														/>
													</div>
													<span className="whitespace-nowrap">
														{formatNumber(result.avgTokensPerSecondTotal)}
													</span>
												</div>
											</TableCell>
										)}
										{visibleColumns.avgLatency && (
											<TableCell>
												<div className="flex flex-col md:flex-row items-start md:items-center gap-2">
													<div className="w-full md:w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
														<div
															className="h-full bg-primary"
															style={{
																width: `${
																	(result.avgFirstTokenLatency /
																		getMaxValue(
																			data?.results.map(
																				(r) => r.avgFirstTokenLatency
																			) || []
																		)) *
																	100
																}%`,
															}}
														/>
													</div>
													<span className="whitespace-nowrap">
														{formatNumber(result.avgFirstTokenLatency / 1000)}s
													</span>
												</div>
											</TableCell>
										)}
										{visibleColumns.maxMinLatency && (
											<TableCell className="whitespace-nowrap">
												{formatNumber(result.maxFirstTokenLatency / 1000)}/
												{formatNumber(result.minFirstTokenLatency / 1000)}s
											</TableCell>
										)}
										{visibleColumns.totalTests && (
											<TableCell>{result.totalTests}</TableCell>
										)}
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	)
}
